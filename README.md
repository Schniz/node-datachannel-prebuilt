# `node-datachannel` prebuilt binaries

this package contains a prebuilt version of `node-datachannel`.
see https://github.com/murat-dogan/node-datachannel for the original author
and actual source code.

## Generating the prebuilt packages

```sh-session
$ pnpm i
$ bun index.ts
$ pnpm i
$ pnpm publish -r --access=public
```
