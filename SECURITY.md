# Security Policy

## Tuitrix Security Model

- **Firestore Tenant Isolation**: All tutor data is strictly isolated within `tutors/{uid}` via Firestore security rules.
- **AI Privacy Guarantee**: Student PII (names, contact details, financial records) are NEVER transmitted to external AI providers.
- **Client-Side BYOK**: User-provided API keys remain entirely within local browser storage (`localStorage`).

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it immediately to `abdullahsazid109@gmail.com`. We will review and address issues promptly.