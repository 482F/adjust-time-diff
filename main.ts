#!/usr/bin/env -S deno run --allow-write=. --allow-read=. --ext ts
import { Command } from 'https://deno.land/x/cliffy@v0.25.7/command/command.ts'
import { ExpectedError, parseCsvWithHeader } from './util/common.ts'
import { unwrap } from 'https://raw.githubusercontent.com/482F/482F-ts-utils/v2.x.x/src/result.ts'

async function main(
  { csvFilePath, targetDir }: { csvFilePath?: string; targetDir?: string },
) {
  if (!csvFilePath || !targetDir) {
    throw new ExpectedError('必要なオプションが指定されていません')
  }
  const timeDiffRules = unwrap(
    await parseCsvWithHeader(csvFilePath, [
      { from: '開始日時', to: 'start', type: 'Date' },
      { from: '終了日時', to: 'end', type: 'Date' },
      { from: '時差', to: 'diff', type: 'number' },
    ]),
  )

  console.log(timeDiffRules)
}

try {
  await new Command()
    .name('adjust-media-time-diff')
    .description(`
      --target-dir のディレクトリ下の JPG, MP4 に関して、--csv-file-path の定義どおりに時差を修正する
      csv は下記のような形式 (不要な列があっても無視される)
      \`\`\`csv
      開始日時,終了日時,時差
      2021/02/01 12:00,2021/02/15 18:00,-540
      2021/02/16 06:00,2021/02/27 06:00, -60
      \`\`\`
      \`開始日時\`、\`終了日時\` には現地時間での滞在開始日時と終了日時を入力する
      \`時差\` 列には、「\`ファイルの撮影日時\` + \`時差\` = \`現地での撮影日時\`」 となるような値を入力する
      上記の例だと、ファイルの撮影日時が \`2021/02/01 21:00\` (非 12:00) から \`2021/02/16 07:00\` (非 06:00) の間である JPG, MP4 は撮影日時などが +120 分される
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
