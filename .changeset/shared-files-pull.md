---
"fleetfizz": minor
---

Shared Files can be pulled: when the Machine you ship from lacks a Shared File, the Ship asks which other Machine's copy to take, and a Question about overwriting an edited copy can keep that copy instead. The copy comes back encrypted with a one-time key (`openssl` on the other Machine), is written here, and the Ship starts over from it.
