import { NextRequest, NextResponse } from 'next/server'
import { setAuthCookies, getJwtExpiry } from '../_lib/auth'

const COGNITO_REGION = process.env.NEXT_PUBLIC_COGNITO_REGION ?? 'us-east-1'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID ?? ''
const COGNITO_ENDPOINT = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refresh_token')?.value

  if (!refreshToken) {
    return NextResponse.json({ error: 'No session.' }, { status: 401 })
  }

  const cognitoRes = await fetch(COGNITO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }),
  })

  const data = await cognitoRes.json()

  if (!cognitoRes.ok) {
    return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 })
  }

  const idToken: string = data.AuthenticationResult.IdToken
  const response = NextResponse.json({ expiresAt: getJwtExpiry(idToken) })
  setAuthCookies(response, idToken)
  return response
}
