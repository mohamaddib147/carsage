# Issue tracker: Jira

Issues and PRDs for this repo live in Jira, project key `CAR`
(board: https://mohamaddib.atlassian.net/jira/software/projects/CAR/boards/67/backlog).
Use the Atlassian MCP connector. Don't use `gh issue` or `.scratch/`.

## Conventions

- Read a task's acceptance criteria directly from Jira; they define "done".
- Create issues with `createJiraIssue` under the matching epic (Foundation CAR-1,
  Onboarding & Profile CAR-2, Trip Planner CAR-3, AI Advisor CAR-4,
  Security Review CAR-5, Documentation & Submission CAR-6, Project Planning CAR-29).
- Comment on a task with `addCommentToJiraIssue`.
- Set status to In Progress when work is done. **Never transition to Done**;
  the user logs hours and marks Done themselves.

## When a skill says "publish to the issue tracker"

Create a Jira issue in project `CAR`.

## When a skill says "fetch the relevant ticket"

Call `getJiraIssue` with the key (e.g. `CAR-36`).
