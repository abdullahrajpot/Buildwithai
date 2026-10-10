---
policy_id: POL-B-MRI
insurer: INS-B
name: Insurer B - Diagnostic Imaging Coverage Guideline (MOCK)
short: PolicyB
version: 2026.2
---

# Insurer B - Diagnostic Imaging Coverage Guideline (MOCK)

This is a mock guideline written for a hackathon demo. It is not a real insurer policy.

## 1. Scope
procedure: ALL

This guideline covers elective MRI at network hospitals. Pre-approval is required before the scan except
in emergencies.

# Part A: MRI knee without contrast (CPT 73721)

## 2.1 Prior imaging [required]
procedure: 73721

A plain radiograph (X-ray) of the knee must have been performed and reported before MRI is requested.

## 2.2 Conservative therapy [required]
procedure: 73721
min_weeks: 4
waived_by: 2.4

At least 4 weeks of conservative therapy (for example physiotherapy or a home exercise program) must be
documented, including the duration and the outcome. This requirement is waived when a red-flag exception
under section 2.4 is documented.

## 2.3 Functional limitation [required]
procedure: 73721

Persistent symptoms that limit daily activities, such as walking, stairs, kneeling, work, or sleep, must
be documented.

## 2.4 Red-flag exception [optional]
procedure: 73721

Mechanical locking, suspected fracture, suspected infection, or suspected tumor allows MRI without the
conservative therapy period.

# Part B: MRI lumbar spine without contrast (CPT 72148)

## 3.1 Conservative therapy [required]
procedure: 72148
min_weeks: 4
waived_by: 3.4

At least 4 weeks of conservative therapy (for example physiotherapy or supervised exercise) must be
documented, including the duration and the outcome. This requirement is waived when a red-flag exception
under section 3.4 is documented.

## 3.2 Neurological findings [required]
procedure: 72148

Radicular symptoms or an objective neurological deficit must be documented on examination.

## 3.3 Functional limitation [required]
procedure: 72148

Persistent symptoms that limit daily activities must be documented.

## 3.4 Red-flag exception [optional]
procedure: 72148

Suspected cauda equina syndrome, progressive neurological deficit, infection, or malignancy allows MRI
without the conservative therapy period.

## 4. Submission requirements
procedure: ALL

Submit the Letter of Medical Necessity, supporting clinical notes, CPT and ICD-10 codes, and the ordering
provider's details through the network portal.
