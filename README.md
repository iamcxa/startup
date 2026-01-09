# Paydirt

Multi-agent orchestrator with Goldflow execution engine.

## Installation

```bash
deno install --allow-all --name pd paydirt.ts
deno install --allow-all --name paydirt paydirt.ts
```

## Claude Plugin Usage

```bash
# Use as Claude plugin
claude --plugin-dir /path/to/paydirt

# Or install to plugins directory
cp -r . ~/.claude/plugins/paydirt
```

## Usage

```bash
pd stake "Implement user authentication"
pd survey
pd continue
```
