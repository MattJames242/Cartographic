# Cartographic 🗺️

**Born here. Died there. Who were they?**

A mobile game. A map shows where a famous historical figure was **born** (green) and where they **died** (red), with the years. Work out who it is.

## How to play
- You get **4 tries** per round. Suggestions appear as you type.
- Each wrong guess, or tapping **Hint**, reveals another clue: 1) the place names, 2) who they were, 3) their initials.
- Points per round: 4 → 3 → 2 → 1. A game has 10 rounds, so the top score is 40.
- **Daily challenge**: everyone gets the same 10 figures each day. You can share your result as an emoji grid.

## Install it on your phone
1. On GitHub, open **Settings → Pages**. Under *Build and deployment*, set **Source: Deploy from a branch**. Pick the branch with this code and the `/ (root)` folder, then click **Save**.
2. After a minute the game will be live at `https://<your-username>.github.io/Cartographic/`.
3. Open that link on your phone:
   - **iPhone (Safari):** tap Share → **Add to Home Screen**.
   - **Android (Chrome):** tap ⋮ → **Install app** (or **Add to Home screen**).

It opens full-screen like a native app and keeps your stats on the device.

## Adding more people
Edit `data.js`. Each entry looks like this:
```js
{ n: "Name", a: ["Alt name"], d: "Short description", b: [birthYear, "Birth place", lat, lng], x: [deathYear, "Death place", lat, lng] }
```
Use negative years for BC. Add `"c"` as a 5th item in `b` or `x` for a circa (approximate) year.

## Tech
Plain HTML/CSS/JS with no build step. Uses [Leaflet](https://leafletjs.com/) with Esri terrain tiles. A service worker lets it install as a Progressive Web App.
