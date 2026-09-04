# qRead

A Qur'an reading app built to make daily reading a habit. One ayah at a time,
held still. A short reverse timer, a daily goal you can actually hit, and a
streak that forgives a bad day but not a missing one.

Runs entirely in the browser. No account, no backend, no network after first
load. Progress is saved locally and can be exported to a file.

## Development

```
npm install
npm run dev        # dev server
npm test           # core logic tests
npm run build      # static output in dist/
```

`npm run data` rebuilds `public/data/` from the upstream sources. It is a rare
manual step -- the generated data is committed so ordinary builds need no
network. It requires `unzip` on PATH.

## Sources and licences

| Asset | Source | Licence |
|---|---|---|
| Arabic text (Uthmani) | [Tanzil Project](https://tanzil.net) v1.1 | CC BY 3.0, verbatim only |
| English translation | *Quran in English*, Talal Itani, [ClearQuran](https://www.clearquran.com) | see `public/licenses/clearquran.txt` |
| Amiri Quran, Noto Naskh Arabic | aliftype / notofonts | SIL OFL 1.1 |

Both texts are reproduced verbatim and only reshaped into JSON. Full notices are
in `public/licenses/` and shown in the app.
