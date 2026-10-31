import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const OpenRequestSchema = z.object({
  /** Absolute directory chosen in Explorer, on the daemon host */
  path: z.string(),
  /** The daemon's server id; the app's workspace routes are keyed by it */
  serverId: z.string(),
});
export type OpenRequest = z.infer<typeof OpenRequestSchema>;

/** Long-poll: resolves with the next Explorer request, or null when the poll window ends first */
export const nextOpenRequestRpc = defineRpc({
  name: "open-with-paseo.next",
  input: z.object({}),
  output: z.object({ request: OpenRequestSchema.nullable() }),
});
