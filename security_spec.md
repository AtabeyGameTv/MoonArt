# MoonArt Security Specification (Phase 0)

## 1. Data Invariants

1. **Strict Personal Gallery Isolation**: Every document in `/users/{userId}/artworks/{artworkId}` MUST have `ownerId == userId == request.auth.uid`, verified email (`email_verified == true`), and is strictly unreadable and unwritable by any other user.
2. **24-Hour Share Lifetime**: Every document in `/sharedArtworks/{artworkId}` MUST set `sharedAt == request.time`, `updatedAt == request.time`, `heartCount == 0`, `editRevision == 0`, and `expiresAt` strictly within `(request.time, request.time + 24h + 2m]` on creation. Expired documents (`expiresAt <= request.time`) are denied from public `list` and non-owner `get`.
3. **Zero PII Exposure**: Public `/sharedArtworks` and `/likes` documents NEVER contain `email`, `phone`, or `address`.
4. **Heart Reset Invariant on Owner Edit**: When an owner updates `/sharedArtworks/{artworkId}` (title or image), the rule MUST enforce `incoming().heartCount == 0` and `incoming().editRevision == existing().editRevision + 1`, resetting collected hearts to zero.
5. **Atomic 1-Heart-Per-User-Per-Revision**: Liking or unliking `/sharedArtworks/{artworkId}/likes/{likeId}` MUST happen inside an atomic batch alongside `/sharedArtworks/{artworkId}` (`heartCount` +/- 1), verified with `existsAfter`/`getAfter`, where `likeId == request.auth.uid + '_' + string(parent.editRevision)`.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Cross-User Gallery Read**: User B attempts `get` or `list` on `/users/userA/artworks`. -> `PERMISSION_DENIED`.
2. **Identity Spoofing on Gallery Create**: User B creates `/users/userB/artworks/art1` with `ownerId: "userA"`. -> `PERMISSION_DENIED`.
3. **Unverified Email Write**: User with `email_verified: false` attempts to create an artwork or like. -> `PERMISSION_DENIED`.
4. **Ghost / Shadow Field Injection**: User creates `/sharedArtworks/s1` with extra field `isFeatured: true`. -> `PERMISSION_DENIED`.
5. **Fake Initial Hearts**: User creates `/sharedArtworks/s1` with `heartCount: 999` or `editRevision: 5`. -> `PERMISSION_DENIED`.
6. **Excessive Share Duration**: User creates `/sharedArtworks/s1` with `expiresAt` 30 days in the future. -> `PERMISSION_DENIED`.
7. **Owner Edit Without Resetting Hearts**: Owner edits `title` on `/sharedArtworks/s1` while keeping `heartCount: 12`. -> `PERMISSION_DENIED`.
8. **Owner Edit Without Incrementing Revision**: Owner edits `imageDataUrl` and sets `heartCount: 0` but keeps `editRevision` unchanged. -> `PERMISSION_DENIED`.
9. **Non-Atomic Heart Inflation**: User updates `/sharedArtworks/s1` `heartCount` from `0` to `50` without creating a matching `/likes/{uid}_{rev}` document. -> `PERMISSION_DENIED`.
10. **Orphaned Like Write**: User creates `/sharedArtworks/s1/likes/userB_0` without incrementing parent `heartCount` in the same batch. -> `PERMISSION_DENIED`.
11. **Duplicate / Forged Like ID**: User B creates `/sharedArtworks/s1/likes/userA_0` or arbitrary ID `customLike`. -> `PERMISSION_DENIED`.
12. **Resource Poisoning / Invalid ID**: User writes to `/sharedArtworks/bad$id` or submits a 2MB `imageDataUrl` or 500-char `title`. -> `PERMISSION_DENIED`.
