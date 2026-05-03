# Contributing to MedLedger

First off, thank you for considering contributing to MedLedger! Open-source tools thrive on community input, especially when it comes to privacy-focused software.

To save everyone time and prevent frustration, please read the following guidelines before opening an Issue or submitting a Pull Request (PR).

## The Ironclad Rules of MedLedger
MedLedger has a very strict architectural philosophy. **Pull Requests that violate these core tenets will be politely closed:**

1. **NO Backend Servers:** MedLedger is a Pure Client-Side Application. Do not submit PRs that require a Node.js backend, a SQL database, Firebase auth, or a custom API.
2. **NO Telemetry or Tracking:** This app handles sensitive health data. We do not use Google Analytics, tracking pixels, crash reporters, or any other form of data harvesting. 
3. **NO External Asset Dependencies:** The app must be able to load and function fully offline once installed as a PWA. Do not link to external CDNs for fonts, icons, or CSS frameworks.

## What We *Are* Looking For
* **UI/UX Improvements:** Accessibility fixes, high-contrast mode tweaks, or cleaner CSS layouts.
* **Performance Optimizations:** Better ways to handle the IndexedDB transactions or DOM updates.
* **Bug Fixes:** Edge cases with day-rollovers, notification logic, or offline caching.
* **Localization/Translations:** Helping make the app accessible in more languages.

## The "Fork It" Policy
If you have an idea for a massive feature—like integrating Bluetooth heart rate monitors, adding social sharing, or building a companion smartwatch app—that falls outside the minimalist scope of this project, you are highly encouraged to **fork the repository**. 

Take the code, build your dream features for your own instance, and have fun! But understand that highly complex, niche features will likely not be merged into the main branch to keep the core application lightweight and stable.

## How to Submit a Pull Request
1. Open an Issue first to discuss the proposed change (unless it's a simple typo/CSS fix).
2. Fork the repo and create a new branch (`git checkout -b feature/your-feature-name`).
3. Ensure your code does not break the local-first architecture.
4. Submit the PR with a clear explanation of what was changed and why.
