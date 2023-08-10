import { create as exifParserCreate } from 'https://deno.land/x/deno_exif@0.0.4/mod.ts'
import { Result } from 'https://raw.githubusercontent.com/482F/482F-ts-utils/v2.x.x/src/result.ts'
import { formatDate } from 'https://raw.githubusercontent.com/482F/482F-ts-utils/v2.x.x/src/common.ts'
import { ExpectedError } from './common.ts'

async function powershellRun(args: string[]): Promise<Result<string>> {
  const output = await new Deno.Command('powershell.exe', { args }).output()
  if (output.success) {
    return [new TextDecoder('shift-jis').decode(output.stdout), undefined]
  } else {
    return [
      undefined,
      new Error(new TextDecoder('shift-jis').decode(output.stderr)),
    ]
  }
}

const exiftool = {
  async write(filePath: string, keyValueMap: Record<string, string>) {
    try {
      return [
        await new Deno.Command('exiftool', {
          args: [
            '-overwrite_original',
            ...Object.entries(keyValueMap).map(([key, value]) =>
              `-${key}="${value}"`
            ),
            filePath,
          ],
        })
          .output()
          .then(({ stdout }) => new TextDecoder().decode(stdout)),
        undefined,
      ]
    } catch (e) {
      return [undefined, e]
    }
  },
}

export async function readShootingDate(
  filePath: string,
): Promise<Result<Date>> {
  const date = await (() => {
    if (filePath.match(/\.jpe?g$/i)) {
      return Deno.readFile(filePath).then((file) => {
        const date = new Date(
          exifParserCreate(file).parse().tags
            .DateTimeOriginal * 1000,
        )
        date.setHours(date.getHours() - 9)
        return date
      })
    } else {
      return Deno.stat(filePath).then((stat) => stat.mtime)
    }
  })()
  if (!date || isNaN(date.getTime())) {
    return [
      undefined,
      new ExpectedError('撮影の取得に失敗しました: ' + filePath),
    ]
  }
  return [date, undefined]
}

export async function writeShootingDate(
  filePath: string,
  shootingDate: Date,
): Promise<Result<undefined>> {
  if (/\.(jpe?g)$/iu.test(filePath)) {
    const [, err] = await exiftool.write(filePath, {
      AllDates: formatDate(shootingDate, '$yyyy:$MM:$dd $HH:$mm:$ss'),
    })
    if (err) {
      return [undefined, err]
    }
  }
  for (const name of ['CreationTime', 'LastWriteTime']) {
    const [, err] = await powershellRun([
      'Set-ItemProperty',
      '-path',
      `"${filePath.replaceAll('/', '\\')}"`,
      '-name',
      name,
      '-value',
      formatDate(shootingDate, '"$yyyy/$MM/$dd $HH:$mm:$ss"'),
    ])
    if (err) {
      return [undefined, err]
    }
  }
  return [undefined, undefined]
}
