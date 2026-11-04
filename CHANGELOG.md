# CHANGELOG Index

Це індекс томів changelog. Детальні записи ведуться у `docs/changelogs`.

## Поточний активний том

1. [CHANGELOG_2026_VOL_01.md](docs/changelogs/CHANGELOG_2026_VOL_01.md) — active volume

## Політика ротації

1. `soft limit`: 900 рядків на том.
2. `hard limit`: 950 рядків на том.
3. Коли том досягає `~900` рядків, створюється наступний том (`VOL_NN`) з короткою анотацією на початку.
4. Нові записи додаються тільки в активний том.
5. У цей індекс додається новий запис про том (статус, контекст, посилання).

## Формат імені файлу

`docs/changelogs/CHANGELOG_<YEAR>_VOL_<NN>.md`

Приклад: `docs/changelogs/CHANGELOG_2026_VOL_02.md`
