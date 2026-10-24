# Sound credits

The six KeyBuddy sounds are cut from the LumeKeebs video
[Creamy vs Thocky vs Clacky vs Poppy vs Clicky](https://www.youtube.com/watch?v=uPZy6d_M3hg).
Parts for every build are at [lumekeebs.com](https://www.lumekeebs.com).

| Pack | Build |
|---|---|
| Creamy | Evo80, PP plate, Neo x Keygeek Oat linears |
| Poppy | Rainy75 Pro, HMX Pink Pig |
| Clacky | Rainy75 Standard, Akko Cilantro |
| Thocky | Crush80, ceramic keycaps, Kailh Cocoa |
| Clicky | QK65, Outemu Ocean clicky |
| Lego | Luminkey80, BSUN Dusty Rose |

The source audio isn't committed (`sounds/raw/` is git-ignored). Sections used:
creamy 0–6 s, poppy 7–18 s, clacky 20–26 s, thocky 29–37 s, clicky 38–44 s,
lego 46 s–end. Cut each to a mono 48 kHz WAV, then:

    python3 -I tools/slice.py --files site/packs /tmp/demo lk-creamy=creamy.wav lk-poppy=poppy.wav ...

Recorded packs made in the app ("Record your keyboard") stay on your computer.
