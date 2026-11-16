# Roosevelt Connect Admin Dashboard

Web dashboard for school staff to manage content and see check-in data for **Roosevelt Connect**, the campus app used at Eleanor Roosevelt High School.

## What it does
- **Staff sign-in** with Firebase Authentication (email/password)
- **Events and tutors:** create, edit, and delete the entries the mobile app shows
- **Event check-in approvals:** bulk-add the student IDs approved for an event, which the app's ID scanner checks against
- **Usage view:** check-in activity per teacher over a date range, from the student check-in logs

## Tech
React · Firebase Authentication · Cloud Firestore

## Running locally
```bash
npm install
npm start          # http://localhost:3000
```
Firebase project settings live in `src/firebase.js`.

## Security note
The Firebase web config is public by design. All access control is enforced by the **Firestore security rules** on the Firebase project, which should allow writes only from signed-in staff accounts.
