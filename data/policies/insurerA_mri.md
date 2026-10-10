---
policy_id: POL-A-MRI
insurer: INS-A
name: Insurer A - Advanced Imaging Pre-Authorization Policy (MOCK)
short: PolicyA
version: 2026.1
---

# Insurer A - Advanced Imaging Pre-Authorization Policy (MOCK)

This is a mock policy written for a hackathon demo. Its structure is modeled on publicly documented
imaging coverage criteria, but the wording and thresholds are our own. It is not a real insurer policy.

## 1. Scope
procedure: ALL

This policy applies to elective, non-emergency MRI requested at panel hospitals. Emergency imaging does
not require pre-authorization. Requests must be submitted by the ordering facility before the scan.

# Part A: MRI knee without contrast (CPT 73721)

## 2.1 Plain radiographs [required]
procedure: 73721

A weight-bearing plain radiograph (X-ray) of the affected knee must be completed and reported before an
MRI is requested. The radiograph report or a dated reference to it must be included.

## 2.2 Conservative therapy [required]
procedure: 73721
min_weeks: 6
waived_by: 2.4

At least 6 weeks of conservative therapy (for example supervised physiotherapy or a structured home
exercise program) must be documented, including the duration and the outcome. This requirement is waived
when a red-flag exception under section 2.4 is documented.

## 2.3 Functional limitation [required]
procedure: 73721

The clinical notes must document persistent symptoms that limit daily function, such as difficulty with
walking, stairs, kneeling, work, or sleep.

## 2.4 Red-flag exception [optional]
procedure: 73721

Mechanical locking of the knee, suspected fracture, suspected infection, or suspected tumor allows MRI
without completing conservative therapy, provided the red-flag finding is documented by the treating
physician.

# Part B: MRI lumbar spine without contrast (CPT 72148)

## 3.1 Conservative therapy [required]
procedure: 72148
min_weeks: 6
waived_by: 3.4

At least 6 weeks of conservative therapy (for example physiotherapy, supervised exercise, or analgesic
management) must be documented, including the duration and the outcome. This requirement is waived when a
red-flag exception under section 3.4 is documented.

## 3.2 Neurological findings [required]
procedure: 72148

Radicular symptoms or an objective neurological deficit (for example a positive straight leg raise,
reduced reflexes, dermatomal sensory loss, or weakness) must be documented on examination.

## 3.3 Functional limitation [required]
procedure: 72148

The clinical notes must document persistent symptoms that limit daily function, such as difficulty with
walking, sitting, work, or sleep.

## 3.4 Red-flag exception [optional]
procedure: 72148

Suspected cauda equina syndrome, progressive neurological deficit, suspected infection, or suspected
malignancy allows MRI without completing conservative therapy.

## 4. Submission requirements
procedure: ALL

Each request must include a Letter of Medical Necessity, the relevant clinical notes, CPT and ICD-10
codes, and the ordering provider's details. Incomplete requests are returned without review.
