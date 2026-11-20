# Between us — polish plan (from Oliver's phone tests, 20 Nov 2026)

## A. Bugs that break the smoothness (first)
1. **Old username/password form appears when you come back to the app.** The only way in is the secret word. Remove the old form completely; the secret word shows only at first sign-in and after sign-out.
2. **Coming back to the app restarts it.** Today the app locks and replays the log lines each time you return, then lands on Home. Fix: while signed in, coming back keeps you exactly where you were (same tab, same game, same scroll), with no log lines.
3. **Music keeps playing after pause and can't be stopped.** Find every sound source (music player, piano tiles, dance beat, voice notes, lock-screen controls) and make Pause stop all of them. Add one "stop all sound" path.
4. **Profile photo never uploads.** Cause found: only photos under 1 MB were accepted; iPhone photos are 2–5 MB. Fix ready: the phone makes a 720 px square before upload. To deploy and test.
5. **Garden score shows 0 while you have 14 points.** The garden pins show air hockey wins, not points. Show this week's points (same as Play).
6. **Blurry backgrounds in the games.** Remove the blur from the lights and the landscape behind every game.
7. **Truth or dare navigation.** Add a back arrow from the question to the Mild / Hot / Harissa choice. Leaving the game clears the old question.
8. **Word duel and Learn must fit the phone.** No scrolling to reach the answers or Continue: the card shrinks to fit the screen.
9. **Technical text on screen** ("Authorized data checked · revision 41…", server wording). Remove from what you see.

## B. Garden
10. 360° rotation.
11. Walls that flicker: fix them (z-fighting).
12. A button to hide the scores.
13. Watering can and Plant buttons inside the garden (also in full screen).
14. More comfortable navigation: smoother drag, double-tap to zoom, a reset view button.

## C. Notifications
15. A step-by-step tutorial in Us for adding Between us to the iPhone Home Screen and turning notifications on, with pictures, always available.

## D. New designs — mockups first, you choose
16. "How I am today" (mood).
17. The Write / Note / Poem / Photo / Voice buttons and the journal.
18. Questions and Music cards on Home.

## E. Talk (WhatsApp / Telegram / Snapchat level)
19. Full-screen chat, not a box in the middle of the page.
20. Voice notes: listen before sending, re-record, or delete.
21. Photos and videos open full screen. You choose before sending: view once, view twice, or keep in the chat.
22. Editor before sending:
    - crop and rotate;
    - trim a video;
    - draw;
    - add text, stickers and emoji;
    - filters.
23. Your own stickers made from your photos (cut out), saved for both of you.
24. Also: reply by swipe, emoji reactions, a typing indicator (exists), and "seen" (exists).
25. Voice and video calls.
    - Built with WebRTC, using your private Supabase channel to connect the two phones.
    - Calls that must cross mobile networks need a relay server (TURN). That needs a free account from you (Cloudflare or Metered).

## How I will test (every round)
- **Automated tests** for every rule (the 288 existing, plus new ones for each fix).
- **Click tests:** a robot plays both of you on two phones, tapping through every page, button, game, sheet and back arrow. Each time it checks:
  - nothing is cut off;
  - nothing needs scrolling to continue;
  - no errors appear;
  - the right screen comes back.
- **"Leave and come back" tests:**
  - switch apps;
  - lock the phone;
  - reload;
  - come back after the sign-in expires.
  - Each time, the same page must still be there, with no form and no log lines.
- **Sound tests:** start every sound, then pause, leave and come back. Nothing may keep playing.
- **Visual tests:** screenshots of every screen on small, medium and large iPhones, in the dusk look, the light look and Derja (right to left). I review each one.
- **Live check after each publish:** opening screens only, no writing.
- **Limits:**
  - My robot browser is Chrome, not Safari, so iPhone-only behaviour still needs your test on the phone.
  - My local test servers stop after about two hours and must be restarted each session.

## What I need from you
- Pick your favourite mockups for section D.
- For calls: a free TURN account (I'll send the steps).
- Spotify Client ID when you have it.
