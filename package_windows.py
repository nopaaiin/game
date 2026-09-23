"""Build a Windows handoff ZIP from the same game files used on macOS."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
FILES = (
    'chicken_game.html', 'chicken_game_sim.html', 'display-profile.js',
    'display-config.json', 'exhibition.css', 'exhibition_server.py',
    'start_tv3_windows.py', 'start_tv3.bat', 'WINDOWS_README.md', 'EXHIBITION.md',
)


def build():
    target = ROOT / 'dist' / 'oven-sauna-tv3-windows.zip'
    target.parent.mkdir(exist_ok=True)
    sources = [ROOT / name for name in FILES]
    for directory in ('px', 'assets', 'lib'):
        sources.extend(p for p in sorted((ROOT / directory).rglob('*'))
                       if p.is_file() and not any(part.startswith('.') for part in p.relative_to(ROOT).parts))
    with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
        for source in sources:
            data = source.read_bytes()
            if source.suffix == '.bat':
                data = data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
            archive.writestr('oven-sauna-tv3/' + source.relative_to(ROOT).as_posix(), data)
    return target


if __name__ == '__main__':
    result = build()
    print(f'{result} ({result.stat().st_size / 1024 / 1024:.1f} MB)')
