# LinkedIn Job Outreach

A small app that turns a pile of scraped LinkedIn hiring posts into a short list of jobs that actually fit you, and helps you reach out to each recruiter.

## What it does

1. **Reads your resume** and writes down your job preferences in plain English (you can edit them).
2. **Removes posts you have already seen**, so you never process the same post twice.
3. **Asks an AI to check every new post** against your resume and preferences: is it a real job you could get? What are the contact details (emails, phone numbers, application forms, LinkedIn contacts)?
4. **Lets you reach out**: send an AI-written email (with your resume attached) to one recruiter or to all of them, open application forms, or jump to the post on LinkedIn.

Everything runs on your own computer. Your data stays in plain files on your disk. There is no database and no account to create.

## Set it up (about 5 minutes)

**You need:** [Node.js](https://nodejs.org) 18 or newer, and a free [OpenRouter](https://openrouter.ai) API key.

1. Open a terminal in this folder and install:
   ```
   npm install
   ```
2. Create your settings file. Copy `.env.example` to `.env.local` and fill in two lines:
   ```
   OPENROUTER_API_KEY=your key from openrouter.ai
   OPENROUTER_MODEL=a model name from openrouter.ai/models (free ones work)
   ```
3. Start the app:
   ```
   npm run dev
   ```
4. Open **http://localhost:3000** in your browser.

If you change `.env.local` later, stop the app (Ctrl+C) and run `npm run dev` again.

## How to use it

The left menu has four steps. Do them in order the first time.

### 1. Profile setup
- **Upload your resume** (PDF only, and the text must be selectable, not a scanned image). Give the profile a name, for example `my-resume`. Each name gets its own folder, so you can keep several resumes side by side.
- Press **Test connection**. The app says "Hi are you listening" to the AI. When it answers, the other steps unlock.
- **Job preferences:** press **Get preferences from resume**. You can type extra wishes in the box first (for example "only remote jobs, never Java, no unpaid internships"). The AI writes a short text file, `preferences.md`. Below it you can:
  - pick any version of the file from the list and read it,
  - edit it by hand,
  - add notes in plain words and press **Update with AI** to merge them into the final version.

  Write it the way you would tell a person: what you want, what you never want, and how your emails should sound (for example "say relocation available if needed", "don't mention salary unless the job asks").

### 2. Upload posts
Upload the JSON file of scraped posts (for example `linkedin_hiring_posts_2026-09-11.json`). The app keeps a copy, drops every post it has already seen, and saves only the new ones for the next step.

### 3. AI screening
Press **Start**. The AI goes through the new posts one by one and decides which fit you. You can **Stop** at any time and press **Continue** later: finished posts are never redone. If the free AI model has a bad moment, the run pauses by itself and you can continue when it works again.

### 4. Outreach
Your matching posts, grouped by how you can apply: **Email, Form, Website, Phone, LinkedIn DM, Comment**. On each post card you can:

| Button | What it does |
|---|---|
| LinkedIn icon (top right) | Opens the post on LinkedIn |
| **Send email** | The AI writes a short email, attaches your resume, sends it, and marks the post done |
| **Preview email** | Shows the email first, without sending |
| **Mark as done** | For forms, links and anything you did yourself. **Undo** takes it back |
| **Read original post** | Shows the full post text |

Use the search box and filters to narrow down the list (to do, done, failed, best fit first).

**Sending emails.** Open **Settings** in the *Email sending* box and enter your email account once (for Gmail, create an *App password* in your Google account and use that instead of your normal password). Then:
- **Send a test email** to yourself first.
- **Send to all** sends every pending email post one by one in the background. It respects a **daily limit** (400 by default, you can change it) and waits a few seconds between emails. You can stop it and start it again; emails already sent are never repeated.

## Where your files are

Everything for you lives in `user-data/<your profile name>/`:

| File or folder | What it is |
|---|---|
| `resume/` | Your resume PDF and its text |
| `preferences.md` | Your preferences in plain text. Open and edit it any time |
| `posts/` | Copies of every file you uploaded, and the new posts waiting to be screened |
| `results/` | The AI's verdict and contact details for every screened post |
| `outreach/status.json` | Which posts are sent or done |

Your email account and daily send log are in `data/` (`email-account.json`, `email-log.json`).

`.env.local`, `data/` and `user-data/` are private and are not meant to be shared or uploaded to Git.

## Tips and fixes

- **"The AI test failed":** check the key and model name in `.env.local`, and make sure you restarted the app after editing it. Free models are sometimes busy; try again in a minute.
- **"No readable text found in this PDF":** your resume is probably a scan. Export it again from Word or Google Docs as a PDF.
- **A post has no email or form:** it can still be useful. Use the LinkedIn icon to open it, and the author profile link to message the recruiter.
- **Start fresh:** delete the profile's folder in `user-data/` (this removes its history too).
- **Always preview first:** sending is real. Use **Preview email** and the test email before using **Send to all**.
