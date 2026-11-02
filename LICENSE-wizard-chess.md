# Wizard Chess pieces

The chess pieces in this repository, in the app (`app/board3d/models/wizard_*.glb`, built into
`app/assets/board3d/board3d.html`) and to print (`3d-prints/stl/piece_*.stl`), are not covered
by the MIT licence in [LICENSE](LICENSE). Everything else is.

They come from **"Wizard Chess", remixed by Meyerhouse on MakerWorld**
(https://makerworld.com, a remix of a set modelled on the Wizard's Chess set from the Harry Potter
films). They keep the licence they are published under there, and the film design belongs to
its owners. They were converted by `app/board3d/tools/import-wizard.mjs`: scaled to a 20 mm base,
a magnet pocket cut into each, and simplified for the game. If you redistribute or sell this
project, check that licence first, or replace the pieces: run the importer on another set's
`.3mf`.
