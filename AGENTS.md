# Instructions for agents

Before doing any work in this repository:

1. Read the Operating Rules in the Open Art Media Linear team docs in full: https://linear.app/open-art-media/document/operating-rules-be291f096b11
2. Read the Implementation Plan: https://docs.google.com/document/d/16a5xHnKBo6BKIwtAnVJzswlJR3Em9TPJmZZIBsjcnzo/edit
   It is the active plan (written as milestones and numbered issues because Linear is at its issue limit). Find the current issue in its "Current state" section and work only that issue.
3. Read the Design Specification: https://docs.google.com/document/d/1UY8eNpPs_zBgQbGKyk2B0hoghZnzkWEBN96D_W8CHco/edit

Working rules for this repo:

- One branch per plan issue. Merge to `main` only after the issue's acceptance conditions pass.
- Commit and push at each coherent, verifiable checkpoint so other agents and machines always see current work.
- Update the issue's Status and Evidence lines in the plan as you work. While an issue is in progress, its Evidence line holds the branch, the last verified checkpoint and the next action.
- Keep progress only in the plan document, not in Linear.
- Review gates don't wait for Gabrielle: hand the reviewer the exact commit or tag and how to test it, fix what the reviewer finds, and let the reviewer recheck before moving on.
- Only the plan's ⭐ CHECK-IN issues, or a real blocker, wait for Gabrielle.
- Never change the live portal (main branch of ctrlZ-work/transcendent-sprite-6f2e9a) without Gabrielle's explicit approval.
