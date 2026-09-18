# Third-party notices

Calliope Poker is released under the MIT License (see `LICENSE`). It includes and
redistributes the material below, which carries its own terms.

## EFF short wordlist

`packages/server/src/wordlist.ts` contains the 1296 words of the **EFF short
wordlist #1**, used to generate the five-word recovery tickets that let a player
get their record back on another device.

- Source: Electronic Frontier Foundation, <https://www.eff.org/dice>
- File: <https://www.eff.org/files/2016/09/08/eff_short_wordlist_1.txt>
- License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)

EFF's policy is that original material on its website "may be freely distributed
at will under the Creative Commons Attribution 4.0 International License", and
asks redistributors to make it known where the file originated so that people can
find more information or an updated version. Hence this notice.

The list has been reformatted from tab-separated dice rolls into a TypeScript
array. The words themselves are unchanged. EFF does not endorse this project.

## Fonts

The built web client embeds both of these as `.woff2` files, so it redistributes
them. Both are licensed under the **SIL Open Font License, Version 1.1**, whose
full text is in `licenses/`.

| Font | Copyright | License text |
|---|---|---|
| [Fraunces](https://github.com/undercasetype/Fraunces) | Copyright 2020 The Fraunces Project Authors | `licenses/Fraunces-OFL.txt` |
| [Instrument Sans](https://github.com/Instrument/instrument-sans) | Copyright 2022 The Instrument Sans Project Authors | `licenses/InstrumentSans-OFL.txt` |

Both are delivered through the [Fontsource](https://fontsource.org) packages
`@fontsource-variable/fraunces` and `@fontsource-variable/instrument-sans`.

Under the OFL, these fonts may be used, modified and redistributed freely,
including commercially, but may not be sold on their own, and any derivative
font must not use the Reserved Font Names.

## QR codes

The join-link QR code is generated with **qrcode-generator**, which is bundled
into the web client.

- Source: <https://github.com/kazuhikoarase/qrcode-generator>
- Copyright 2009 Kazuhiko Arase
- License: MIT, full text in `licenses/qrcode-generator-MIT.txt`

Only the module matrix comes from the library; the SVG is drawn by this project
(`packages/web/src/components/QrCode.tsx`).

"QR Code" is a registered trademark of DENSO WAVE INCORPORATED. The mark is used
here only to describe what the feature is.

## Dependencies

Everything installed from npm is permissively licensed. At the time of writing,
across 204 packages in the dependency tree:

| License | Packages |
|---|---|
| MIT | 166 |
| ISC | 16 |
| BlueOak-1.0.0 | 7 |
| Apache-2.0 | 7 |
| BSD-3-Clause | 4 |
| OFL-1.1 | 2 |
| CC-BY-4.0 | 1 |
| Unlicense | 1 |

There is no GPL, LGPL, AGPL, MPL or SSPL code in the tree. Apache-2.0 packages
carry their own NOTICE requirements, satisfied by the license files shipped
inside each package under `node_modules`.

To re-check after changing dependencies:

```bash
npx license-checker --summary
```

## Card and chip artwork

The playing cards, card backs and chips are original SVG drawn for this project
(`packages/web/src/components/Card.tsx` and `Chip.tsx`). No third-party card
deck, image or icon set is used anywhere in the interface.
