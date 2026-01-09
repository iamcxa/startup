---
description: Resume an existing Paydirt Caravan
---

# Continue Caravan

Resume work on an existing Caravan.

## Steps

1. If no Caravan ID is provided, list available Caravans:

```bash
paydirt survey
```

2. Ask the user which Caravan to continue if multiple are available.

3. Resume the Caravan:

```bash
paydirt continue <caravan-id>
```

## Example

```bash
paydirt continue PD-42
```

After resuming, display:

```
╭────────────────────────────────────────╮
│  🚃 CARAVAN RESUMED                    │
│  ID: <caravan-id>                      │
│  Task: <task>                          │
╰────────────────────────────────────────╯
```
