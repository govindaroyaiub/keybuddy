# Sound credits

Every KeyBuddy pack is sliced from recordings released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) on Freesound.
CC0 needs no attribution, but these people made KeyBuddy sound real — thank you.

| Pack | Recording | Author | Switch |
|---|---|---|---|
| Thocky | [Keyboard clicking typing Cherry Red Mechanical](https://freesound.org/people/handygaber/sounds/499773/) | handygaber | Cherry MX Red (Corsair K95) |
| Thocky (fallback) | [Typing on a mechanical keyboard](https://freesound.org/people/IRF1010N/sounds/583085/) | IRF1010N | Gateron Red (GMMK TKL) |
| Clacky | [keyboard2.wav](https://freesound.org/people/samchitto/sounds/696040/) | samchitto | Linear |
| Clacky (fallback) | [Typing on a keyboard](https://freesound.org/people/SamsterBirdies/sounds/489422/) | SamsterBirdies | Gateron Red |
| Clicky | [Typing on a keyboard](https://freesound.org/people/SamsterBirdies/sounds/489424/) | SamsterBirdies | Cherry MX Blue |
| Clicky | [qKey.wav](https://freesound.org/people/UberBosser/sounds/421583/) | UberBosser | Blue |
| Clicky (fallback) | [keyboard typing](https://freesound.org/people/seth-m/sounds/269713/) | seth-m | Cherry MX Blue |
| Tactile | [Mechanical Keyboard Typing (Treble Version)](https://freesound.org/people/stu556/sounds/450282/) | stu556 | Cherry MX Brown |
| Tactile | [Keyboard - Press down](https://freesound.org/people/Foxfire-/sounds/570754/) | Foxfire- | Cherry MX Brown |

Raw files are not committed (`sounds/raw/` is git-ignored). To rebuild packs,
download the HQ previews into `sounds/raw/` with the names used in
`tools/slice.py`, then run:

    python3 -I tools/slice.py sounds/raw src-tauri/packs sounds/demo
