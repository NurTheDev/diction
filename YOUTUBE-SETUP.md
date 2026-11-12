# YouTube channel video feed

The Demo Classes page shows video previews from the institution's channel (`https://www.youtube.com/@DictionCoaching`). With no API configuration it shows a clearly labeled **selection**, not all videos, plus a link to the full channel. The seven sample videos and their locally stored thumbnails were verified from the public channel in November 2026; review them regularly for availability, accuracy and permission. Visitors press play before a YouTube iframe is loaded. Privacy-enhanced `youtube-nocookie.com` is used, but Google/YouTube still receives the request when the visitor plays; review and update your privacy notice.

## Show public uploads automatically

1. Create or select your own Google Cloud project, enable **YouTube Data API v3**, and create an API key. This is a separate API from Gemini; a Gemini key does not automatically grant access. Restrict the key to YouTube Data API v3 and appropriate server restrictions supported by your hosting arrangement. Set quota and budget alerts. See <https://developers.google.com/youtube/v3/getting-started>.
2. Add the key privately to `.env.local` or the server's private environment settings:

   ```dotenv
   YOUTUBE_DATA_API_KEY=your-private-youtube-data-api-key
   ```

   Never paste the key in chat, commit it, or use `NEXT_PUBLIC_`. The key is sent by the server as an API header, not embedded in browser code. An existing `NEXTAUTH_SECRET` (at least 32 characters) is required to sign pagination cursors. Database/auth setup is needed to change the channel in the admin dashboard. Restart or redeploy after setting variables.
3. Under Admin → Site Settings, set the YouTube channel to a canonical channel handle such as `https://www.youtube.com/@DictionCoaching` or a canonical `/channel/UC...` URL. Save the settings. Other URL shapes are not used to construct the feed. In an unconfigured/development preview the bundled channel is used.
4. Open the public Demo Classes page and check the first page and **Load more videos**. The server resolves the channel's uploads playlist, retrieves public uploads in pages, and filters out entries that the API marks private. YouTube may omit or restrict some videos, Shorts, live streams or embeds; unavailable or non-embeddable videos are controlled by YouTube. Cached data may be up to 30–60 minutes old, and viewers can always visit the channel directly. A failed request shows the selected sample (for the verified default channel) or a channel link; it is not silently labeled as the complete live list.

Requests use signed, channel-specific pagination cursors and server-side caching, but a public endpoint still needs platform-level rate limiting and quota monitoring before production. The integration has been tested against a local mock, not a real API key or channel account. A public-link request and playing an embed use third-party services. Verify content, rights, privacy/consent and local legal requirements before deployment. Manually published demo videos in Admin → Content are still displayed separately under Selected lessons.
