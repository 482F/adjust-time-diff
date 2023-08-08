import { Result } from 'https://raw.githubusercontent.com/482F/482F-ts-utils/v2.x.x/src/result.ts'

export class ExpectedError extends Error {}

const fieldTypes = {
  string: {
    converter: (val: string) => val,
    validator: () => true,
  },
  number: {
    converter: (val: string) => Number(val),
    validator: (val: unknown) => typeof val === 'number' && !isNaN(val),
  },
  Date: {
    converter: (val: string) => new Date(val),
    validator: (
      val: unknown,
    ) => ((val instanceof Date) && !isNaN(val.getDate())),
  },
} as const
type FieldType = keyof typeof fieldTypes

export async function parseCsvWithHeader<
  const H extends readonly (
    | string
    | (
      & {
        from: string
        to: string
      }
      & (
        | {}
        | {
          converter: (val: string) => unknown
          validator?: (val: unknown) => boolean
        }
        | {
          type: FieldType
        }
      )
    )
  )[],
>(
  filePath: string,
  expectedHeaders: H,
): Promise<
  Result<
    (
      & {
        [
          header in H[number] as header extends { to: string } ? header['to']
            : header
        ]: header extends { type: infer T extends FieldType }
          ? typeof fieldTypes[T] extends { converter: (val: string) => infer R }
            ? R
          : never
          : header extends { converter: (val: string) => infer R } ? R
          : string
      }
      & Record<string, string>
    )[]
  >
> {
  const headerMap = Object.fromEntries(
    expectedHeaders.map((expectedHeader) =>
      typeof expectedHeader === 'string'
        ? {
          from: expectedHeader,
          to: expectedHeader,
          type: 'string',
        } satisfies { from: string; to: string; type: FieldType }
        : expectedHeader
    )
      .map((header) => ({
        ...('type' in header ? fieldTypes[header.type] : fieldTypes['string']),
        ...header,
      }))
      .map((header) => [header.from, header]),
  )
  const bytes = await Deno.readFile(filePath)
  const encodings = ['shift-jis', 'utf-8']
  for (const encoding of encodings) {
    const text = new TextDecoder(encoding).decode(bytes)
    const lines = text.split('\n')
    const headerLine = lines[0]
    if (!headerLine) {
      continue
    }
    const headers = headerLine.split(',')
    const headerSet = new Set(headers)
    if (
      !Object.keys(headerMap).every((expectedHeader) =>
        headerSet.has(expectedHeader)
      )
    ) {
      continue
    }

    const csvData = []
    for (const line of lines.slice(1).filter(Boolean)) {
      const fields = []
      const filledLine = [...line.split(','), ...Array(headers.length).fill('')]
        .slice(
          0,
          headers.length,
        )
      for (let i = 0; i < filledLine.length; i++) {
        const field = filledLine[i]

        const header = headerMap[headers[i] ?? '']
        if (!header) {
          continue
        }
        const converter = header.converter ?? ((val: string) => val)
        const convertedField = converter(
          field.replaceAll(/^\s+|\s+$/g, ''),
        )
        if (header.validator && !header.validator(convertedField)) {
          return [
            undefined,
            new ExpectedError(
              'フィールドの形式が適切ではありません: ' + headers[i] + ':' +
                field,
            ),
          ]
        }
        fields.push([
          header.to,
          convertedField,
        ])
      }
      csvData.push(Object.fromEntries(fields))
    }
    return [csvData, undefined]
  }
  return [
    undefined,
    new ExpectedError(
      'ヘッダには次の項目が含まれる必要があります: [' +
        expectedHeaders.join(',') + ']',
    ),
  ]
}
