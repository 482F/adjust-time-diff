#!/usr/bin/env -S deno run --allow-write=. --allow-read=. --allow-run=powershell.exe,exiftool --ext ts
import { Command } from 'https://deno.land/x/cliffy@v0.25.7/command/command.ts'
import {
  announceTime,
  ExpectedError,
  parseCsvWithHeader,
} from './util/common.ts'
import { unwrap } from 'https://raw.githubusercontent.com/482F/482F-ts-utils/v2.x.x/src/result.ts'
import { walk } from 'https://deno.land/std@0.198.0/fs/walk.ts'
import { readShootingDate, writeShootingDate } from './util/media.ts'
import { parse } from 'https://deno.land/std/path/mod.ts'

async function main(
  { csvFilePath, targetDir }: { csvFilePath?: string; targetDir?: string },
) {
  if (!csvFilePath || !targetDir) {
    throw new ExpectedError('必要なオプションが指定されていません')
  }
  const timeDiffRules = unwrap(
    await parseCsvWithHeader(csvFilePath, [
      { from: '開始日時_写真', to: 'start', type: 'Date' },
      { from: '終了日時_写真', to: 'end', type: 'Date' },
      { from: '増減分', to: 'diff', type: 'number' },
    ]),
  )
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((rule, i, allRules) => ({
      ...rule,
      isIn: (date: Date) => {
        const time = date.getTime()
        const startTime = rule.start.getTime()
        const endTime = allRules[i + 1]?.start.getTime() ?? Infinity
        return startTime <= time && time <= endTime
      },
    }))

  const files: { path: string; date: Date }[] = []
  await announceTime('ファイル探索', async (doFunc) => {
    for await (const entry of walk(targetDir, { match: [/\.(jpe?g|mp4)$/i] })) {
      const path = entry.path
      if (/adjusted/.test(path)) {
        continue
      }
      const originalDate = unwrap(await readShootingDate(path))
      const diff = timeDiffRules.find(({ isIn }) => isIn(originalDate))?.diff ??
        0
      const date = new Date(originalDate)
      date.setMinutes(date.getMinutes() + diff * -1)
      files.push({ path, date })
      doFunc()
    }
  }, '?')
  if (!files.length) {
    throw new ExpectedError('実行対象のファイルが見つかりませんでした')
  }
  announceTime('時差修正', async (doFunc) => {
    for (const { path, date } of files) {
      unwrap(await writeShootingDate(path, date))
      const { dir, name, ext } = parse(path)
      await Deno.rename(path, `${dir}/${name}_adjusted${ext}`)
      doFunc()
    }
  }, files.length)
}

try {
  await new Command()
    .name('adjust-media-time-diff')
    .description(`
      --target-dir のディレクトリ下の JPG, MP4 に関して、--csv-file-path の定義どおりに時差を修正する
      csv は下記のような形式 (不要な列があっても無視される)
      \`\`\`csv
      開始日時_写真,終了日時_写真,増減分
      2021/02/01 12:00,2021/02/15 18:00,-540
      2021/02/16 06:00,2021/02/27 06:00, -60
      \`\`\`
      \`開始日時_写真\`、\`終了日時_写真\` には日本時間 (非現地時間) での滞在開始日時と終了日時を入力する
      \`増減分\` 列には、「\`ファイルの撮影日時\` + \`増減分\` = \`現地での撮影日時\`」 となるような値を入力する (一行目であれば日本から見たイギリスの場合)
      上記の例だと、ファイルの撮影日時が \`2021/02/01 12:00\` から \`2021/02/16 06:00\` (非 02/15 18:00) の間である JPG, MP4 は撮影日時などが -540 分される
    `)
    .option(
      '--csv-file-path <name:string>',
      '時差情報が含まれている CSV ファイルのパス (必須)',
    )
    .option(
      '--target-dir <name:string>',
      'JPG や MP4 が入っているディレクトリパス (必須)',
    )
    .action(main)
    .parse(Deno.args)
} catch (e) {
  if (e instanceof ExpectedError) {
    console.error('[ERROR]', e.message)
  } else {
    console.error(e)
  }
  Deno.exit(1)
}
