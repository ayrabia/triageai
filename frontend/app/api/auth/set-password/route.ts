/**
 * POST /api/auth/set-password
 *
 * Completes the NEW_PASSWORD_REQUIRED challenge for invited users.
 * Exchanges (email, session, newPassword) for real tokens.
 */

import { NextRequest, NextResponse } from 'next/server'
import { setAuthCookies, getJwtExpiry } from '../../_lib/auth'

const COGNITO_REGION = process.env.NEXT_PUBLIC_COGNITO_REGION ?? 'us-east-1'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID ?? ''
const COGNITO_ENDPOINT = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`

export async function POST(req: NextRequest) {
  const { email, session, newPassword } = await req.json()

  if (!email || !session || !newPassword) {
    return NextResponse.json({ error: 'email, session and newPassword are required' }, { status: 400 })
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const cognitoRes = await fetch(COGNITO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.RespondToAuthChallenge',
    },
    body: JSON.stringify({
      ClientId: CLIENT_ID,
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      Session: session,
      ChallengeResponses: {
        USERNAME: email,
        NEW_PASSWORD: newPassword,
      },
    }),
  })

  const data = await cognitoRes.json()

  if (!cognitoRes.ok) {
    const message =
      data.__type === 'InvalidPasswordException' ? data.message :
      'Failed to set password. Please try again.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const idToken: string = data.AuthenticationResult.IdToken
  const refreshToken: string = data.AuthenticationResult.RefreshToken
  const response = NextResponse.json({ expiresAt: getJwtExpiry(idToken) })
  setAuthCookies(response, idToken, refreshToken)
  return response
}
