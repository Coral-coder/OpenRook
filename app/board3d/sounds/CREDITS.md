# Battle sound credits

The cues in this folder (`<cue>_<n>.mp3`, mono MP3, ~60 kbps) are built by `make_sounds.py` from
real recordings. Each one is layered, re-pitched, filtered and put in a synthetic stone-hall reverb,
then loudness-normalised. Every source is **CC0 / public domain**, so no attribution is legally
required. We credit them anyway, with thanks.

`build.mjs` embeds the MP3s into `board3d.html` as base64, and `src/sfx.js` plays them.

| Folder (`make_sounds.py`) | Source | Author | Licence | URL |
|---|---|---|---|---|
| `medieval1` | Medieval sound effects: Weapon impacts (weapon on weapon, part 1 of 2) | Still North Media | CC0 | https://opengameart.org/content/medieval-sound-effects-weapon-impacts |
| `swishes` | Swishes Sound Pack | artisticdude | CC0 | https://opengameart.org/content/swishes-sound-pack |
| `rpgpack` | RPG Sound Pack (battle/swing*.wav) | artisticdude | CC0 | https://opengameart.org/content/rpg-sound-pack |
| `impactsn` | 10 Impact/Shield Blocks | StarNinjas | CC0 | https://opengameart.org/content/10-impactshield-blocks |
| `towel` | 12 wet towel hitting/falling/punching floor sounds | qubodup | CC0 | https://opengameart.org/content/12-wet-towel-hittingfallingpunching-floor-sounds |
| `breakfall` | 75 CC0 breaking / falling / hit sfx | rubberduck | CC0 | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx |
| `rpg80` | 80 CC0 RPG SFX | rubberduck | CC0 | https://opengameart.org/content/80-cc0-rpg-sfx |
| `sfx100` | 100 CC0 SFX | rubberduck | CC0 | https://opengameart.org/content/100-cc0-sfx |
| `sfx100v2` | 100 CC0 SFX #2 | rubberduck | CC0 | https://opengameart.org/content/100-cc0-sfx-2 |
| `kenneyrpg` | 50 RPG sound effects (knifeSlice) | Kenney (kenney.nl) | CC0 | https://opengameart.org/content/50-rpg-sound-effects |
| `crunch` | 5 break, crunch impacts (Independent.nu ljudbank) | qubodup | CC0 | https://opengameart.org/content/5-break-crunch-impacts |
| `squish` | 8 wet squish, slurp impacts (Independent.nu ljudbank) | qubodup | CC0 | https://opengameart.org/content/8-wet-squish-slurp-impacts |
| `deepbreaks` | Deep Bone Crack/Break SFX | Zane Little Music | CC0 | https://opengameart.org/content/deep-bone-crackbreak-sfx |
| `rockbreak` | Breaking Rock | themightyglider | CC0 | https://opengameart.org/content/breaking-rock |
| `boulderdrop` | Moving Boulder (boulder_drop) | themightyglider | CC0 | https://opengameart.org/content/moving-boulder |
| `cavein` | Cave In | StarNinjas | CC0 | https://opengameart.org/content/cave-in |
| `muffled` | Muffled Distant Explosion | NenadSimic | CC0 | https://opengameart.org/content/muffled-distant-explosion |
| `quake` | Earthquake and Open sesame (the earthquake part) | mieki256 | CC0 | https://opengameart.org/content/earthquake-and-open-sesame |
| `rainthunder` | Rain + Long Thunder | wuxiascrub | CC0 | https://opengameart.org/content/rain-long-thunder |
| `fantozzi` | Fantozzi's Footsteps (Grass/Sand & Stone) | Fantozzi, sliced by qubodup | CC0 | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone |
| `flame` | Catching fire | themightyglider | CC0 | https://opengameart.org/content/catching-fire |
| `fire` | Fire Crackling | antumdeluge | CC0 | https://opengameart.org/content/fire-crackling |
| `freeze` | Freeze Spell | artisticdude | CC0 | https://opengameart.org/content/freeze-spell-0 |
| `ice` | Ice breaking/shattering | ignasd | CC0 | https://opengameart.org/content/ice-breakingshattering |
| `teleport` | Teleport Spell | ogrebane | CC0 | https://opengameart.org/content/teleport-spell |
| `darkmagic` | 3 dark magic spells | qubodup | CC0 | https://opengameart.org/content/3-dark-magic-spells |
| `earthspell` | Earth Element Magic Spell | qubodup | CC0 | https://opengameart.org/content/earth-element-magic-spell |
| `sandspell` | Sand spell | qubodup | CC0 | https://opengameart.org/content/sand-spell |
| `airwhoosh` | Air whoosh | pyranostudios | CC0 | https://opengameart.org/content/air-whoosh |
| `mud` | 25 CC0 mud sfx | rubberduck | CC0 | https://opengameart.org/content/25-cc0-mud-sfx |
| `usc_pavement` | GOLD TAPE 38: Horses, "G38-10 Horse Walks on Pavement" | USC Cinema / Sunset Editorial collection (digitised by Craig Smith) | CC0 | https://archive.org/details/GOLD_TAPE_38_Horses |
| `usc_whinny12` | GOLD TAPE 38: Horses, "G38-12 Horse Whinnies" | USC Cinema / Sunset Editorial collection (digitised by Craig Smith) | CC0 | https://archive.org/details/GOLD_TAPE_38_Horses |

The two USC recordings come from old tape transfers. `make_sounds.py` removes their steady hiss
by spectral subtraction. The Internet Archive collection page is
https://archive.org/details/sound-effect-libraries-red-gold-sunset-editorial.

## Which cue uses what

| Cue | Built from |
|---|---|
| sword_swing | swishes (heavy), rpgpack swings |
| sword_clash | medieval1 (Norse sword vs axe / mace / sabre, blade on blade), towel thud for weight |
| sword_hit_stone | medieval1 blade transient, breakfall rock hits and chips, rpg80 item_stone |
| stab | kenneyrpg knifeSlice, crunch, towel |
| shield_block | medieval1 (mace on spear haft), impactsn |
| shield_bash | sfx100 slam, sfx100v2 metal_hit, medieval1, boulderdrop |
| stone_crack | deepbreaks, breakfall rock breaking / falling |
| stone_break_small | rockbreak, breakfall rock breaking / falling, rpg80 stones |
| stone_break_large | boulderdrop, rockbreak, crunch, cavein, muffled |
| stone_crumble | cavein, rpg80 stones, breakfall |
| body_fall | boulderdrop, towel, rpg80 stones, breakfall, muffled |
| dust | cavein (high-passed trickle), breakfall pebbles |
| footstep_stone | fantozzi stone steps |
| footstep_heavy | fantozzi stone steps (pitched down), boulderdrop, rpg80 stones |
| hoof | usc_pavement |
| horse_neigh | usc_whinny12 |
| clap | towel (slap), rpg80 item_stone, breakfall rock hit |
| spell_charge | teleport, fire (reversed), darkmagic (reversed), earthspell |
| lightning | rainthunder, sfx100v2 thunder, crunch, breakfall |
| fire_whoosh | flame, rpg80 spell_fire, swishes, fire |
| ice_form | freeze, ice |
| ice_shatter | ice, boulderdrop |
| magic_shield | flame (reversed), swishes (reversed), darkmagic, impactsn |
| magic_impact | muffled, darkmagic, rockbreak, rpg80 spell |
| telekinesis | airwhoosh, rpg80 stones, earthspell |
| shockwave | muffled, airwhoosh, breakfall |
| earthquake | quake, cavein, muffled |
| wormhole_hum | airwhoosh, rainthunder rumble, darkmagic (all slowed); loopable |
| wormhole_boom | muffled, rainthunder, boulderdrop, quake |
| wake | deepbreaks, rpg80 stones, breakfall, boulderdrop |
| settle | boulderdrop, cavein, rpg80 stones, breakfall |
| promotion | quake (low-passed rumble, no grinding), sandspell and ice (sparkle), swishes, boulderdrop |
| ooze | mud, squish |
