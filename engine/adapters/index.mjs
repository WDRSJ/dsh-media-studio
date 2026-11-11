import siliconflow from'./siliconflow.mjs';
// Trusted local adapters register here. No downloaded code or UI-supplied scripts are evaluated.
export const adapters=new Map([siliconflow].map(a=>[a.id,a]));
export const adapterFor=id=>adapters.get(id);
export const adapterPresets=Object.assign({},...[...adapters.values()].map(a=>a.presets));
