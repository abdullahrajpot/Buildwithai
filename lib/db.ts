// Storage layer. Uses MongoDB when MONGODB_URI is set, otherwise a local JSON file store with the
// same collections, so the demo runs on any laptop with no database installed.
//
// Audit rule (spec section 10): audit_log is insert-only. update/replace/delete refuse that collection.
import fs from "node:fs";
import path from "node:path";
import type { Db, MongoClient } from "mongodb";

export type Collection =
  | "patients"
  | "documents"
  | "insurers"
  | "cases"
  | "policies"
  | "policy_chunks"
  | "packets"
  | "submissions"
  | "appeals"
  | "audit_log"
  | "run_cache";

const COLLECTIONS: Collection[] = [
  "patients", "documents", "insurers", "cases", "policies", "policy_chunks",
  "packets", "submissions", "appeals", "audit_log", "run_cache",
];

type Doc = { _id: string } & Record<string, unknown>;
type Filter = Record<string, unknown>;
export interface FindOptions {
  sort?: Record<string, 1 | -1>;
  limit?: number;
}

export interface Store {
  kind: "mongodb" | "json";
  find<T>(c: Collection, filter?: Filter, opts?: FindOptions): Promise<T[]>;
  findOne<T>(c: Collection, filter: Filter): Promise<T | null>;
  insertOne<T extends { _id: string }>(c: Collection, doc: T): Promise<void>;
  replaceOne<T extends { _id: string }>(c: Collection, doc: T): Promise<void>; // upsert
  updateOne(c: Collection, id: string, set: Filter): Promise<void>;
  count(c: Collection, filter?: Filter): Promise<number>;
  /** Removes one document. Refuses audit_log. Used by the seed script for temporary cache runs. */
  deleteOne(c: Collection, id: string): Promise<void>;
  /** Wipes every collection. Only called by the seed script, never by the app. */
  resetAll(): Promise<void>;
}

function assertMutable(c: Collection) {
  if (c === "audit_log") throw new Error("audit_log is append-only: updates and deletes are not allowed");
}

function matches(doc: Doc, filter: Filter = {}) {
  return Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v) && "$in" in (v as object)) {
      return ((v as { $in: unknown[] }).$in).includes(doc[k]);
    }
    return doc[k] === v;
  });
}

function sortDocs<T>(docs: T[], sort?: Record<string, 1 | -1>) {
  if (!sort) return docs;
  const [[key, dir]] = Object.entries(sort);
  return [...docs].sort((a, b) => {
    const av = (a as Record<string, unknown>)[key] as string | number;
    const bv = (b as Record<string, unknown>)[key] as string | number;
    return av < bv ? -dir : av > bv ? dir : 0;
  });
}

// ---------- JSON file store ----------

type JsonData = Record<Collection, Doc[]>;

class JsonStore implements Store {
  kind = "json" as const;
  private data: JsonData | null = null;
  private mtime = 0;
  constructor(private file: string) {}

  private load(): JsonData {
    // Re-read when another process (the seed script) changed the file.
    let stat: fs.Stats | null = null;
    try { stat = fs.statSync(this.file); } catch { /* no file yet */ }
    if (this.data && stat && stat.mtimeMs === this.mtime) return this.data;
    const empty = Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as JsonData;
    if (!stat) { this.data = empty; return this.data; }
    const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<JsonData>;
    this.data = { ...empty, ...parsed };
    this.mtime = stat.mtimeMs;
    return this.data;
  }

  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
    this.mtime = fs.statSync(this.file).mtimeMs;
  }

  async find<T>(c: Collection, filter?: Filter, opts?: FindOptions) {
    let docs = this.load()[c].filter((d) => matches(d, filter));
    docs = sortDocs(docs, opts?.sort);
    if (opts?.limit) docs = docs.slice(0, opts.limit);
    return structuredClone(docs) as T[];
  }
  async findOne<T>(c: Collection, filter: Filter) {
    const doc = this.load()[c].find((d) => matches(d, filter));
    return doc ? (structuredClone(doc) as T) : null;
  }
  async insertOne<T extends { _id: string }>(c: Collection, doc: T) {
    const data = this.load();
    if (data[c].some((d) => d._id === doc._id)) throw new Error(`Duplicate _id ${doc._id} in ${c}`);
    data[c].push(structuredClone(doc) as unknown as Doc);
    this.save();
  }
  async replaceOne<T extends { _id: string }>(c: Collection, doc: T) {
    assertMutable(c);
    const data = this.load();
    const i = data[c].findIndex((d) => d._id === doc._id);
    const copy = structuredClone(doc) as unknown as Doc;
    if (i === -1) data[c].push(copy); else data[c][i] = copy;
    this.save();
  }
  async updateOne(c: Collection, id: string, set: Filter) {
    assertMutable(c);
    const data = this.load();
    const doc = data[c].find((d) => d._id === id);
    if (!doc) throw new Error(`${c}/${id} not found`);
    Object.assign(doc, structuredClone(set));
    this.save();
  }
  async count(c: Collection, filter?: Filter) {
    return this.load()[c].filter((d) => matches(d, filter)).length;
  }
  async deleteOne(c: Collection, id: string) {
    assertMutable(c);
    const data = this.load();
    data[c] = data[c].filter((d) => d._id !== id);
    this.save();
  }
  async resetAll() {
    this.data = Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as JsonData;
    this.save();
  }
}

// ---------- MongoDB store ----------

class MongoStore implements Store {
  kind = "mongodb" as const;
  private dbPromise: Promise<Db>;
  constructor(uri: string, dbName: string) {
    this.dbPromise = (async () => {
      const { MongoClient } = await import("mongodb");
      const client: MongoClient = new MongoClient(uri);
      await client.connect();
      return client.db(dbName);
    })();
  }
  private async col(c: Collection) {
    return (await this.dbPromise).collection<Doc>(c);
  }
  async find<T>(c: Collection, filter: Filter = {}, opts?: FindOptions) {
    let cursor = (await this.col(c)).find(filter);
    if (opts?.sort) cursor = cursor.sort(opts.sort);
    if (opts?.limit) cursor = cursor.limit(opts.limit);
    return (await cursor.toArray()) as unknown as T[];
  }
  async findOne<T>(c: Collection, filter: Filter) {
    return (await (await this.col(c)).findOne(filter)) as unknown as T | null;
  }
  async insertOne<T extends { _id: string }>(c: Collection, doc: T) {
    await (await this.col(c)).insertOne(doc as unknown as Doc);
  }
  async replaceOne<T extends { _id: string }>(c: Collection, doc: T) {
    assertMutable(c);
    await (await this.col(c)).replaceOne({ _id: doc._id }, doc as unknown as Doc, { upsert: true });
  }
  async updateOne(c: Collection, id: string, set: Filter) {
    assertMutable(c);
    await (await this.col(c)).updateOne({ _id: id }, { $set: set });
  }
  async count(c: Collection, filter: Filter = {}) {
    return (await this.col(c)).countDocuments(filter);
  }
  async deleteOne(c: Collection, id: string) {
    assertMutable(c);
    await (await this.col(c)).deleteOne({ _id: id });
  }
  async resetAll() {
    await (await this.dbPromise).dropDatabase();
  }
}

// ---------- singleton ----------

const g = globalThis as unknown as { __pacStore?: Store };

export function getStore(): Store {
  if (!g.__pacStore) {
    const uri = process.env.MONGODB_URI?.trim();
    g.__pacStore = uri
      ? new MongoStore(uri, process.env.MONGODB_DB || "pac")
      : new JsonStore(path.join(process.cwd(), ".data", "pac-db.json"));
  }
  return g.__pacStore;
}
