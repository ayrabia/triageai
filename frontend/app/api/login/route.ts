import { NextRequest, NextResponse } from 'next/server'

const COGNITO_REGION = process.env.NEXT_PUBLIC_COGNITO_REGION ?? 'us-east-1'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID ?? ''
const COGNITO_ENDPOINT = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required.' }, { status: 400 })
  }

  const cognitoRes = await fetch(COGNITO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  })

  const data = await cognitoRes.json()

  if (!cognitoRes.ok) {
    const type = data.__type ?? ''
    const message =
      type === 'NotAuthorizedException'
        ? 'Incorrect email or password.'
        : type === 'UserNotFoundException'
        ? 'No account found with that email.'
        : 'Login failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 401 })
  }

  const idToken: string = data.AuthenticationResult.IdToken
  const refreshToken: string = data.AuthenticationResult.RefreshToken
  return NextResponse.json({ idToken, refreshToken })
}
