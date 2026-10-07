import { FixedCommandBuilder } from "../../apps/builder/dist/index.js";
const { settings, version } = JSON.parse(process.argv[2]);
const builder = new FixedCommandBuilder({ ...settings, versionReader: async () => version });
const result = await builder.build({ buildId: `interruption-${version}`, targetVersion: version });
process.send(result);
process.disconnect();
