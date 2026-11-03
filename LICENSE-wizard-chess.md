# Wizard Chess pieces

The chess pieces in this repository, in the app (`app/board3d/models/wizard_*.glb`, built into
`app/assets/board3d/board3d.html`) and to print (`3d-prints/wizard-chess/`, `3d-prints/stl/piece_*.stl`
and `3d-prints/stl/board-fit/`), are not covered
by the MIT licence in [LICENSE](LICENSE). Everything else is.

They come from **"Wizard Chess", remixed by Meyerhouse on MakerWorld**
(https://makerworld.com, a remix of a set modelled on the Wizard's Chess set from the Harry Potter
films). They keep the licence they are published under there, and the film design belongs to
its owners. The printable files are the originals unchanged (the board-fit copies are only scaled);
`app/board3d/tools/import-wizard.mjs` simplified copies only for the game. If you redistribute or sell this
project, check that licence first, or replace the pieces: run the importer on another set's
`.3mf`.
