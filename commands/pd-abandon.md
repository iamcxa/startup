---
description: Stop and abandon a Paydirt Caravan
---

# Abandon Caravan

Stop and abandon a Caravan, marking it as cancelled.

## Steps

1. If no Caravan ID is provided, list active Caravans:

```bash
paydirt survey
```

2. Ask the user which Caravan to abandon if multiple are available.

3. Confirm with the user before abandoning:

```
Are you sure you want to abandon Caravan <caravan-id>? (y/n)
```

4. Abandon the Caravan:

```bash
paydirt abandon <caravan-id>
```

## Example

```bash
paydirt abandon PD-42
```

After abandoning, display:

```
╭────────────────────────────────────────╮
│  🚃 CARAVAN ABANDONED                  │
│  ID: <caravan-id>                      │
│  Status: Cancelled                     │
╰────────────────────────────────────────╯
```
