import { z } from "zod";

/** The slice of Paseo's config.json that says whether a plugin should still run */
const PaseoConfigSchema = z.object({
  pluginsEnabled: z.boolean().optional(),
  plugins: z.record(z.string(), z.object({ enabled: z.boolean().optional() })).optional(),
});

/**
 * Why the plugin is stopping, read from Paseo's config once the stop has begun: "removed" when its
 * entry is gone, "disabled" when its entry or the global plugin switch is off, else null (a reload,
 * an update, or a daemon shutdown), which keeps the menu entry so the launcher can still start Paseo.
 */
export function stopReason(configText: string, pluginId: string): "removed" | "disabled" | null {
  let config: z.infer<typeof PaseoConfigSchema>;
  try {
    config = PaseoConfigSchema.parse(JSON.parse(configText));
  } catch {
    return null;
  }
  const entry = config.plugins?.[pluginId];
  if (entry === undefined) return "removed";
  return entry.enabled === false || config.pluginsEnabled === false ? "disabled" : null;
}
