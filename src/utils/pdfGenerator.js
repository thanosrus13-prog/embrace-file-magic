import jsPDF from 'jspdf'

function generatePrice() {
  return 'PRICE $8.99'
}

function generateRandomDate() {
  const months = ['JAN.', 'FEB.', 'MAR.', 'APR.', 'MAY', 'JUNE', 'JULY', 'AUG.', 'SEPT.', 'OCT.', 'NOV.', 'DEC.']
  const month = months[Math.floor(Math.random() * 12)]
  const day = Math.floor(Math.random() * 28) + 1
  const year = 2015 + Math.floor(Math.random() * 10)
  return `${month} ${day}, ${year}`
}

function generateCoverLines(city) {
  const lines = [
    ['THE ADVENTURE BEGINS', 'EXPLORING THE UNKNOWN', 'MEMORIES MADE'],
    ['A MOMENT IN TIME', 'THE JOURNEY CONTINUES', 'WANDERLUST'],
    ['CAPTURING MAGIC', 'STORIES UNTOLD', 'LIFE UNFILTERED'],
    ['THE OPEN ROAD', 'NEW HORIZONS', 'ESCAPE THE ORDINARY'],
    ['WILD SPIRITS', 'ROAMING FREE', 'FIND YOURSELF'],
  ]
  const randomSet = lines[Math.floor(Math.random() * lines.length)]
  return randomSet
}

export async function generateMemoirPDF(images, narrative, city = 'Unknown') {
  console.log('Starting PDF generation...')
  console.log('Images:', images)
  console.log('Narrative:', narrative)
  console.log('City:', city)
  
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 10

  // Background - dark moody color
  pdf.setFillColor(30, 30, 40)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')

  // Get image
  const imageList = Array.isArray(images) ? images : [images]
  const mainImage = imageList[0]

  // Try to add main image as cover
  if (mainImage && mainImage.url) {
    try {
      await new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          // Calculate dimensions to cover most of the page
          const imgAspect = img.width / img.height
          const pageAspect = pageWidth / pageHeight
          
          let drawWidth, drawHeight, drawX, drawY
          
          if (imgAspect > pageAspect) {
            drawHeight = pageHeight - 50
            drawWidth = drawHeight * imgAspect
            drawX = (pageWidth - drawWidth) / 2
            drawY = 35
          } else {
            drawWidth = pageWidth - 20
            drawHeight = drawWidth / imgAspect
            drawX = 10
            drawY = 35
          }
          
          pdf.addImage(mainImage.url, 'JPEG', drawX, drawY, drawWidth, drawHeight)
          resolve()
        }
        img.onerror = () => {
          // Fallback gradient background
          pdf.setFillColor(40, 50, 70)
          pdf.rect(10, 35, pageWidth - 20, pageHeight - 85, 'F')
          resolve()
        }
        img.src = mainImage.url
      })
    } catch (e) {
      pdf.setFillColor(40, 50, 70)
      pdf.rect(10, 35, pageWidth - 20, pageHeight - 85, 'F')
    }
  }

  // Dark overlay on image for text readability
  pdf.setFillColor(0, 0, 0)
  pdf.rect(0, 0, pageWidth, 35, 'F')

  // Masthead - VibePost
  pdf.setFont('times', 'bold')
  pdf.setFontSize(42)
  pdf.setTextColor(0, 0, 0)
  pdf.text('VibePost', pageWidth / 2, 22, { align: 'center' })

  // Price (top left)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(255, 255, 255)
  pdf.text(generatePrice(), margin + 2, 10)

  // Date (top right)
  const dateStr = generateRandomDate()
  pdf.text(dateStr, pageWidth - margin - 2, 10, { align: 'right' })

  // Cover lines - white rectangles
  const coverLines = generateCoverLines(city)
  
  // Top left cover line
  pdf.setFillColor(255, 255, 255)
  pdf.roundedRect(margin, pageHeight - 55, 55, 12, 2, 2, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(0, 0, 0)
  pdf.text(coverLines[0], margin + 3, pageHeight - 48)

  // Middle right cover line
  pdf.setFillColor(255, 255, 255)
  pdf.roundedRect(pageWidth - margin - 55, 45, 55, 12, 2, 2, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(0, 0, 0)
  pdf.text(coverLines[1], pageWidth - margin - 52, 52)

  // Bottom center cover line
  pdf.setFillColor(255, 255, 255)
  pdf.roundedRect(pageWidth / 2 - 27.5, pageHeight - 30, 55, 12, 2, 2, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(0, 0, 0)
  pdf.text(coverLines[2], pageWidth / 2, pageHeight - 23, { align: 'center' })

  // City name at bottom
  pdf.setFont('times', 'bold')
  pdf.setFontSize(14)
  pdf.setTextColor(255, 255, 255)
  pdf.text(city !== 'Unknown' ? city.toUpperCase() : 'MY JOURNEY', pageWidth / 2, pageHeight - 10, { align: 'center' })

  console.log('Saving PDF...')
  pdf.save(`VibePost-${city.toLowerCase().replace(/\s+/g, '-')}.pdf`)
  console.log('PDF saved!')
}