"""Generate the owner's public ad copy using edge-tts (project-local optional tool)."""
import asyncio
import json
import pathlib
import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent

async def main():
    script = json.loads((ROOT / 'storyboard/ad-script.json').read_text(encoding='utf-8'))
    target = ROOT / 'public/audio'
    target.mkdir(parents=True, exist_ok=True)
    for segment in script['segments']:
        output = target / f"{segment['id']}-original.mp3"
        metadata = target / f"{segment['id']}-boundaries.jsonl"
        if output.exists() and output.stat().st_size > 0 and metadata.exists():
            print(f"Reusing {output.name}", flush=True)
            continue
        spoken = segment['text'].replace('n8n', 'N eight N')
        await edge_tts.Communicate(spoken, voice=script['voice'], rate='+5%', pitch='-2Hz', boundary='SentenceBoundary').save(str(output), str(metadata))
        print(f"Narration generated: {output.name}", flush=True)

asyncio.run(main())
