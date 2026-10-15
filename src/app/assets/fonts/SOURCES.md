# Local font assets

The WOFF2 subsets in this directory were downloaded from the Google Fonts CSS API and `fonts.gstatic.com` for the existing DM Sans, DM Mono, and Space Grotesk families. The Latin and Latin-extended subsets include the character ranges needed for the app's English/German interface and international player names. Files are served locally; the app does not request fonts from Google Fonts at runtime.

| Family | Local files | Weights | Upstream family files |
| --- | --- | --- | --- |
| DM Sans | `dm-sans-latin.woff2`, `dm-sans-latin-ext.woff2` | Variable 400–700 | `https://fonts.gstatic.com/s/dmsans/v17/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K4.woff2`, `https://fonts.gstatic.com/s/dmsans/v17/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu6-K6h9Q.woff2` |
| DM Mono | `dm-mono-regular-latin.woff2`, `dm-mono-regular-latin-ext.woff2`, `dm-mono-medium-latin.woff2`, `dm-mono-medium-latin-ext.woff2` | 400, 500 | `https://fonts.gstatic.com/s/dmmono/v16/aFTU7PB1QTsUX8KYthqQBA.woff2`, `https://fonts.gstatic.com/s/dmmono/v16/aFTU7PB1QTsUX8KYthSQBLyM.woff2`, `https://fonts.gstatic.com/s/dmmono/v16/aFTR7PB1QTsUX8KYvumzEYOtbQ.woff2`, `https://fonts.gstatic.com/s/dmmono/v16/aFTR7PB1QTsUX8KYvumzEY2tbZX9.woff2` |
| Space Grotesk | `space-grotesk-latin.woff2`, `space-grotesk-latin-ext.woff2` | Variable 400–700 | `https://fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPbF4Cw.woff2`, `https://fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPb94C-s0.woff2` |

Each family is distributed under the SIL Open Font License 1.1. The complete copyright notice and license texts are shipped in `public/fonts/licenses/OFL-DM-Sans.txt`, `public/fonts/licenses/OFL-DM-Mono.txt`, and `public/fonts/licenses/OFL-Space-Grotesk.txt`; those files are copied into production output and precached with the app.
