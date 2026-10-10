---
policy_id: POL-REAL-MRI
insurer: INS-REAL
insurer_name: Real Insurer
insurer_subtitle: public policy
name: <Official policy title as published>
short: RealPolicy
version: <publication date or version>
---

# How to use this template

Copy this file to data/policies/ (any name that does not start with "_"), paste the real policy text
into the sections below, then run "npm run ingest". Keep the original wording; only add the structure:

- one "## <number> <title> [required|optional]" heading per approval criterion
- "procedure: <CPT>" on the line after each heading (use ALL for general sections)
- sections without [required] or [optional] are kept for retrieval but never become criteria

# Part A: <procedure name> (CPT 73721)

## 1. Scope
procedure: ALL

<Paste the policy's scope or general statement here.>

## 2.1 <First criterion title> [required]
procedure: 73721

<Paste the exact policy wording for this criterion.>

## 2.2 <Second criterion title> [required]
procedure: 73721

<Paste the exact policy wording. If it states a duration, keep the number, for example "at least 6 weeks".>

## 2.3 <Exception, if the policy has one> [optional]
procedure: 73721

<Paste the exception wording, for example red-flag findings that waive conservative therapy.>
