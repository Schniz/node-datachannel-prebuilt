import { z } from "zod/v4";
import javascript from "dedent";
import markdown from "dedent";
import fs from "node:fs/promises";
import { $ } from "bun";

const Release = z.object({
  name: z.string(),
  assets: z.array(
    z.object({
      name: z.string(),
      browser_download_url: z.url(),
    }),
  ),
});
const { assets, name } = await fetch(
  "https://api.github.com/repos/murat-dogan/node-datachannel/releases/latest",
)
  .then((x) => x.json())
  .then(Release.parse);
const version = "0.0.0-dev.5"; // name.replace(/^v/, "");

const packages = new Set<string>();

await fs.rm("./prebuilt", { force: true, recursive: true });

for (const asset of assets) {
  const packageName = asset.name.split("-").slice(-2).join("-").split(".")[0];
  if (!packageName) continue;
  let [os, arch] = packageName.split("-");
  let libc: string | undefined = undefined;
  if (os === "linuxmusl") {
    os = "linux";
    libc = "musl";
  } else if (os === "linux") {
    libc = "glibc";
  }
  if (!os || !arch) continue;
  console.log({ packageName, os, arch, ...asset });
  const pkgJson = {
    name: `@datachannels/${packageName}`,
    version,
    license: "MPL 2.0",
    os: [os],
    cpu: [arch],
    ...(libc && { libc: [libc] }),
  };
  packages.add(packageName);
  await Bun.write(
    `./prebuilt/${packageName}/package.json`,
    JSON.stringify(pkgJson, null, 2),
    {
      createPath: true,
    },
  );
  await Bun.write(
    `./prebuilt/${packageName}/README.md`,
    `A prebuilt binary for ${packageName}`,
  );

  const resp = await fetch(asset.browser_download_url);
  if (!resp.ok) {
    throw new Error(
      `Failed to download ${asset.browser_download_url}: ${resp.statusText}`,
    );
  }
  const data = await resp.arrayBuffer();
  await $`tar -xzvC prebuilt/${packageName} < ${data}`;
}

await Bun.write(
  "./packages/prebuilt/package.json",
  JSON.stringify({
    name: "@datachannels/prebuilt",
    version,
    license: "MPL 2.0",
    optionalDependencies: Object.fromEntries(
      Array.from(packages).map((pkg) => [
        `@datachannels/${pkg}`,
        "workspace:*",
      ]),
    ),
    main: "dist/datachannels.cjs",
    types: "types/datachannels.d.ts",
  }),
);

await Bun.write("./packages/prebuilt/README.md", Bun.file("./README.md"));

const packageSelector = javascript`
  () => {
    const packages = [
      ${Array.from(packages, (pkg) => `() => require('@datachannels/${pkg}/build/Release/node_datachannel.node')`).join(",\n      ")}
    ];

    for (const pkg of packages) {
      try {
        const p = pkg();
        if (process.env.DATACHANNELS_PREBUILT_LOG === '1') {
          console.warn('Using prebuilt binary:', p);
        }
        return p
      } catch (e) {}
    }

    throw new Error('No prebuilt binary found for your platform. Please build from source.');
  }
`;

await Bun.build({
  entrypoints: ["./datachannels.js"],
  packages: "bundle",
  target: "node",
  outdir: "packages/prebuilt/dist",
  format: "cjs",
  conditions: ["require", "node"],
  external: ["@datachannels/*"],
  plugins: [
    {
      name: "replace-native",
      setup(build) {
        build.onLoad({ filter: /\/node-datachannel\// }, async (args) => {
          if (args.namespace === "file") {
            let text = await Bun.file(args.path).text();
            text = text.replace(
              'require("../../../build/Release/node_datachannel.node")',
              `(${packageSelector})()`,
            );
            return {
              contents: text,
            };
          }
        });
      },
    },
  ],
});
await Bun.spawn({
  cmd: ["pnpm", "tsdown"],
}).exited;
await fs.rename(
  "packages/prebuilt/dist/datachannels.js",
  "packages/prebuilt/dist/datachannels.cjs",
);
