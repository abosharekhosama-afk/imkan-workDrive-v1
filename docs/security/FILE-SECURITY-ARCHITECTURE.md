# File Security Architecture

## Lifecycle Security
1. **Upload Validation:** Validate MIME type against allowed list. Refuse executables (.exe, .bat) by default.
2. **Storage:** Blob written to S3 with AES-256 encryption.
3. **Malware Scanning:** PENDING DECISION (ICAP Integration). *Requires async queue to scan blob post-upload and flag metadata as safe/infected.*
4. **Download:** Short-lived signed URLs (e.g., 5 minutes) to prevent link sharing outside of app bounds.
