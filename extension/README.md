# OpenPresence Chrome extension

This is the local browser embodiment for an OpenPresence Presence. It intentionally has no account picker, API key field, or channel credentials: the local OpenPresence app supplies the currently selected Presence and the user signs into the controlled Chrome tab using the normal website UI.

## Load locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `extension/` directory.
4. Open the OpenPresence app, choose a Presence, open **Settings → Channel & environment**, and enable **Chrome hands**.
5. Choose **Open controlled Chrome**. OpenPresence creates a dedicated normal Chrome window and tab group named for the Presence.

The extension never stores the website account or credential. The controlled page shows a small OpenPresence overlay while it is observing, preparing, acting, or verifying. The X route supports reply execution, read-only visible-post observation, and periodic verified audience/publication metric collection for Growth; additional channel adapters should follow the same Bridge contract and account-verification boundary.

## Safety boundary

Before a write, the X adapter checks the visible account switcher against the selected Presence handle. If the account cannot be positively matched, execution fails closed and is not acknowledged as successful. Verified external outcomes are written back through the local Bridge API.
