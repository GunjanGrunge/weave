# Firestore Durability and Recovery Runbook

This runbook describes recovery capabilities that are evidenced by this
repository. It does not assert that Google Cloud project settings have been
enabled unless they can be verified from version-controlled configuration.

## Capability Status

| Capability | Repository evidence | Operational status |
| --- | --- | --- |
| Named book snapshots | `saveSnapshot`, `listSnapshots`, `compareSnapshot`, and `restoreSnapshot` Functions | Implemented; deployment and live recovery verification are not recorded |
| Manuscript export | `exportBook` Function writes Markdown or plain text to the Firebase project's default Storage bucket | Implemented; deployment and signed-download verification are not recorded |
| Firestore point-in-time recovery (PITR) | None | Not verified or provisioned by this repository |
| Scheduled managed Firestore exports | None | Not provisioned by this repository |
| Backup bucket lifecycle/retention policy | None | Not provisioned by this repository |

Named book snapshots are application-level editing checkpoints. They are stored
inside the same Firestore database as the live book and therefore are not an
independent disaster-recovery backup.

## Application Snapshot Recovery

The restore endpoint is destructive and must remain an operator-supervised
operation:

1. Confirm the snapshot exists and comparison output matches the intended
   rollback point.
2. Create an independent export before restoring.
3. Call the authenticated `restoreSnapshot` endpoint with an explicit boolean
   confirmation.
4. Verify the book, chapters, scenes, Vision document, messages, generation
   sessions, and background-trigger results before allowing edits to resume.

Restore is committed as one revision-watched Firestore transaction and rejects
manuscripts that exceed its bounded atomic write limit. Restored chapter and
scene documents carry a restore marker so creation triggers do not regenerate
summaries, facts, or Muse notes.

Do not present this procedure as disaster recovery. A database outage or
database-wide data loss can remove both the live data and these snapshots.

## Manuscript Export

The `exportBook` endpoint creates a Markdown or plain-text object under
`exports/` in the project's default Firebase Storage bucket and returns a
15-minute signed URL. It does not fall back to an unauthenticated public URL.

An export is a manuscript copy, not a complete Firestore backup. It does not
contain all operational metadata, messages, usage records, model state, or
snapshot history. Signed URL generation and bucket access must be verified
after deployment before relying on this path.

## Infrastructure Recovery Prerequisites

Before claiming NFR-3 or AD-12 infrastructure recovery coverage, an operator
must provision and record evidence for all of the following:

1. Enable Firestore PITR for the production database and record the database
   name, recovery window, and verification date.
2. Create a dedicated backup bucket in the required region.
3. Configure scheduled managed Firestore exports.
4. Configure object retention or lifecycle rules for the approved retention
   period.
5. Grant only the required Firestore service-agent and recovery-operator IAM
   roles.
6. Perform a restore drill into a separate database or project and record the
   result.

The exact `gcloud` commands depend on the production database, region, bucket,
retention policy, and organization IAM policy. Do not copy placeholder project
or bucket names into an operational command.

## Evidence Record

For each recovery control, record:

- project and database ID;
- configuration command or infrastructure change reference;
- completion timestamp and operator;
- relevant policy output;
- restore-drill date, destination, result, and cleanup confirmation.

Until that evidence exists, production PITR and scheduled managed exports must
be reported as unverified.
