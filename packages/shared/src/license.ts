import type { DoorKind, LicenseInfo } from './types.js';

/** Best-effort license detection from LICENSE file text (used in local mode). */
export function detectLicense(text: string): LicenseInfo | null {
  const t = text.slice(0, 6000);
  const has = (re: RegExp) => re.test(t);
  if (has(/GNU AFFERO GENERAL PUBLIC LICENSE/i)) return { spdx: 'AGPL-3.0', name: 'GNU Affero General Public License v3.0' };
  if (has(/GNU LESSER GENERAL PUBLIC LICENSE/i)) {
    return has(/Version 3/i)
      ? { spdx: 'LGPL-3.0', name: 'GNU Lesser General Public License v3.0' }
      : { spdx: 'LGPL-2.1', name: 'GNU Lesser General Public License v2.1' };
  }
  if (has(/GNU GENERAL PUBLIC LICENSE/i)) {
    return has(/Version 3/i)
      ? { spdx: 'GPL-3.0', name: 'GNU General Public License v3.0' }
      : { spdx: 'GPL-2.0', name: 'GNU General Public License v2.0' };
  }
  if (has(/Mozilla Public License,? (v\. |version )?2\.0/i)) return { spdx: 'MPL-2.0', name: 'Mozilla Public License 2.0' };
  if (has(/Apache License/i) && has(/Version 2\.0/i)) return { spdx: 'Apache-2.0', name: 'Apache License 2.0' };
  if (has(/Permission is hereby granted, free of charge/i)) return { spdx: 'MIT', name: 'MIT License' };
  if (has(/Permission to use, copy, modify, and\/or distribute/i)) return { spdx: 'ISC', name: 'ISC License' };
  if (has(/This is free and unencumbered software released into the public domain/i)) {
    return { spdx: 'Unlicense', name: 'The Unlicense' };
  }
  if (has(/Redistribution and use in source and binary forms/i)) {
    return has(/Neither the name/i)
      ? { spdx: 'BSD-3-Clause', name: 'BSD 3-Clause License' }
      : { spdx: 'BSD-2-Clause', name: 'BSD 2-Clause License' };
  }
  if (has(/CC0 1\.0 Universal/i)) return { spdx: 'CC0-1.0', name: 'Creative Commons Zero v1.0 Universal' };
  if (has(/Eclipse Public License/i)) return { spdx: 'EPL-2.0', name: 'Eclipse Public License' };
  if (has(/Boost Software License/i)) return { spdx: 'BSL-1.0', name: 'Boost Software License 1.0' };
  if (has(/zlib License|This software is provided 'as-is'/i)) return { spdx: 'Zlib', name: 'zlib License' };
  if (has(/DO WHAT THE FUCK YOU WANT/i)) return { spdx: 'WTFPL', name: 'WTFPL' };
  if (t.trim().length > 0) return { spdx: null, name: 'Custom license' };
  return null;
}

const PERMISSIVE = /^(MIT|MIT-0|ISC|BSD-|0BSD|Unlicense|CC0|Zlib|WTFPL|BSL-1\.0|PostgreSQL|NCSA|X11|Python-2\.0|Artistic)/i;
const COPYLEFT = /^(GPL|AGPL|LGPL|MPL|EPL|EUPL|CDDL|OSL|CC-BY-SA)/i;

export function doorForLicense(license: LicenseInfo | null): DoorKind {
  if (!license) return 'cursed';
  const id = license.spdx ?? '';
  if (/^Apache/i.test(id)) return 'iron';
  if (PERMISSIVE.test(id)) return 'wooden';
  if (COPYLEFT.test(id)) return 'enchanted';
  return 'rune';
}

export function doorDescription(door: DoorKind, license: LicenseInfo | null): { title: string; text: string; opens: boolean } {
  const name = license?.name ?? 'No license';
  switch (door) {
    case 'wooden':
      return { title: `${name}`, text: 'A simple wooden door. Permissive. It swings right open.', opens: true };
    case 'iron':
      return { title: `${name}`, text: 'A heavy iron door. It opens — just keep the NOTICE file with you.', opens: true };
    case 'enchanted':
      return {
        title: `${name}`,
        text: 'An enchanted door. It opens, but anything you carry out must stay open source.',
        opens: true,
      };
    case 'rune':
      return { title: `${name}`, text: 'A door covered in fine print. You read all of it. It opens.', opens: true };
    case 'cursed':
    default:
      return {
        title: 'No license',
        text: 'A cursed door. Without a license, nobody may legally enter. The treasure stays locked forever.',
        opens: false,
      };
  }
}
