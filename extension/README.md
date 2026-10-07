# OpenPresence Chrome extension

This is the local browser embodiment for an OpenPresence Presence. It intentionally has no account picker, API key field, or channel credentials: the local OpenPresence app supplies the currently selected Presence and the user signs into the controlled Chrome tab using the normal website UI.

## Load locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `extension/` directory.
4. Open the OpenPresence app, choose a Presence, open **Settings → Channel & environment**, and enable **Chrome hands**.
5. Choose **Set up dedicated Chrome**. OpenPresence creates or reopens a persistent normal Chrome identity for that Presence.
6. In that dedicated identity, load this unpacked extension once and sign in to the expected social account. The existing extension/Bridge flow opens and verifies the controlled tab.

Each Presence gets a different Chrome `user-data-dir`, which keeps cookies, local storage, IndexedDB, and extension state separate. Do not switch accounts by editing cookies inside one shared profile. **Open controlled Chrome** remains available for the existing attached-session workflow.

The extension never stores the website account or credential. The controlled page shows a small OpenPresence overlay while it is observing, preparing, acting, or verifying. The X route supports reply execution, read-only visible-post observation, and periodic verified audience/publication metric collection for Growth; additional channel adapters should follow the same Bridge contract and account-verification boundary.

## Safety boundary

Before a write, the X adapter checks the visible account switcher against the selected Presence handle. If the account cannot be positively matched, execution fails closed and is not acknowledged as successful. Verified external outcomes are written back through the local Bridge API.

Version 0.1.2 reports executor-specific adapter readiness from a live content-script probe. A fresh heartbeat alone does not prove the installed reading, image upload, or verification adapter is usable.

For posts, replies, quotes, and images, a claim-scoped MAIN-world observer reads only X upload, CreateTweet, and exact public TweetDetail responses. It does not record authentication headers, cookies, DM responses, or general timeline content. Image evidence joins the SHA256 of the actual uploaded bytes to X's upload media ID and to the same media ID in a separate public readback. Counts, approved Asset IDs, and composer previews are not delivery proof. Missing response IDs or unsupported upload formats leave verification pending. Verification recovery revisits the created public post and never reopens its composer.

Version 0.1.3 separates image attachment acceptance from text/submit readiness, accepts consumed file inputs only with complete scoped previews, and reports bounded composer diagnostics. Reload the installed extension and refresh its X tab to install this repair; a 0.1.2 heartbeat does not show that the repair is active.
