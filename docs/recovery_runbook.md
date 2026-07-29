# Firestore Durability & Recovery Runbook

This document details the configuration and recovery procedures for the platform's production Firestore database backups, in compliance with **AD-12** and **NFR-3**.

---

## 1. Durability Architecture

1. **Point-in-Time Recovery (PITR):**
   - Enabled on the production Firestore database.
   - Provides a continuous **7-day recovery window**.
   - Allows restoring the database state to any microsecond timestamp within the last 7 days.
2. **Weekly Managed Exports:**
   - A scheduled weekly Cloud Scheduler job triggers a managed Firestore export to a Cloud Storage (GCS) bucket (`gs://story-weaver-backups-prod`).
   - Retained for at least **4 weeks**.
3. **Important Distinction:**
   - **Version Snapshots** (Story 4.1) are user-level, experimental checkpoints saved under the book subcollections. They are *not* part of the infrastructure disaster recovery/durability system.

---

## 2. Recovery Procedures

### A. Restoring from Point-in-Time Recovery (PITR)

To recover the database to a specific microsecond timestamp in the last 7 days:

#### Option 1: Using the `gcloud` CLI
Execute the `gcloud firestore databases restore` command:
```bash
gcloud firestore databases restore \
  --database='(default)' \
  --destination-database='restored-db-prod' \
  --snapshot-time='2026-07-29T12:00:00Z'
```
*Note: Firestore requires restoring to a new database instance. Once restored, configure your application/functions to point to the destination database.*

#### Option 2: Using the Google Cloud Console
1. Navigate to **Firestore** in the GCP Console.
2. Click on the **Databases** tab.
3. Select the target database and click **Restore**.
4. Specify the **Snapshot time** (within the 7-day PITR window).
5. Enter a new **Destination database ID** and click **Restore**.

---

### B. Restoring from a GCS Export

To import a weekly backup exported to Cloud Storage back into Firestore:

#### Step 1: Ensure Permissions
Ensure the Firestore Service Agent has the `Storage Object Viewer` permission on the backup bucket.

#### Step 2: Run Import Command
Execute the import command via `gcloud`:
```bash
gcloud firestore import gs://story-weaver-backups-prod/2026-07-26T04:00:00_weekly/ \
  --database='(default)'
```
*To import only specific collections (e.g. `books`):*
```bash
gcloud firestore import gs://story-weaver-backups-prod/2026-07-26T04:00:00_weekly/ \
  --collection-ids='books' \
  --database='(default)'
```
