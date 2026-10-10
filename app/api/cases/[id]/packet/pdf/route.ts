import { fail, handle, type Params } from "@/lib/api";
import { procedureName } from "@/lib/codes";
import { packetPdf } from "@/lib/pdf";
import { getCase, getPacket } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const [c, packet] = await Promise.all([getCase(id), getPacket(id)]);
  if (!c || !packet) return fail("Packet not found", 404);
  const bytes = await packetPdf(packet, `Pre-authorization packet ${id}: ${procedureName(c.procedure_code)}`);
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${id}-packet-v${packet.version}.pdf"`,
    },
  });
});
