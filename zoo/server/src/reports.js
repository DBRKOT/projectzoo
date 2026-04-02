import PdfPrinter from 'pdfmake'
import xlsx from 'xlsx'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fontBase = path.resolve(__dirname, '../node_modules/pdfmake/fonts')

const fonts = {
  Roboto: {
    normal: path.join(fontBase, 'Roboto-Regular.ttf'),
    bold: path.join(fontBase, 'Roboto-Medium.ttf'),
    italics: path.join(fontBase, 'Roboto-Italic.ttf'),
    bolditalics: path.join(fontBase, 'Roboto-MediumItalic.ttf'),
  },
}

export async function makePdfReport(title, headers, rows) {
  const printer = new PdfPrinter(fonts)
  const safeHeaders = headers.map((h) => String(h ?? ''))
  const safeRows = rows.map((row) => row.map((cell) => String(cell ?? '')))
  const tableBody = [safeHeaders, ...safeRows]
  const docDefinition = {
    content: [
      { text: 'Информационная система "ЗооМенеджер"', style: 'head' },
      { text: title, style: 'title' },
      {
        table: {
          headerRows: 1,
          body: tableBody,
        },
      },
    ],
    styles: {
      head: { fontSize: 12, margin: [0, 0, 0, 8] },
      title: { fontSize: 16, bold: true, margin: [0, 0, 0, 12] },
    },
    defaultStyle: { font: 'Roboto', fontSize: 10 },
  }

  const pdfDoc = printer.createPdfKitDocument(docDefinition)
  const chunks = []
  return new Promise((resolve, reject) => {
    pdfDoc.on('data', (chunk) => chunks.push(chunk))
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
    pdfDoc.on('error', reject)
    pdfDoc.end()
  })
}

export function makeExcelReport(sheetName, headers, rows) {
  const matrix = [headers, ...rows]
  const ws = xlsx.utils.aoa_to_sheet(matrix)
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, sheetName)
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
