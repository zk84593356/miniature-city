# Bundle coordinate system

This directory is an analysis product. The original mirrored files in
`mirror/assets/` remain byte-for-byte pristine.

## Pinned formatter

- Formatter: `js-beautify@1.15.1`
- Main source SHA-256: `bd2411b90aff0e56ec59467180f71fd8d9e0cc7f660666a8db2668a393072f5e`
- Traffic source SHA-256: `dc544a32c4ecdb4391082b1b7e96924a6b25f5b7236e89a49f0c2c6eba2ebb17`

## Reproduction commands

```powershell
npx.cmd --yes js-beautify@1.15.1 mirror\assets\index-zfVzkv9E.js -o mirror\_pretty\index-zfVzkv9E.pretty.js
npx.cmd --yes js-beautify@1.15.1 mirror\assets\traffic-Cw95n69J.js -o mirror\_pretty\traffic-Cw95n69J.pretty.js
```

## Red line

Changing the formatter or its version changes line numbers and invalidates
every `pretty LNNNN` citation in this project. Regenerate only with the exact
commands above. Never overwrite the original files in `mirror/assets/`.
