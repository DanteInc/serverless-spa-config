# serverless-spa-config

Serverless plugin to configure S3, CloudFront and Route53 for a SPA or JAMStack site.

* Creates S3 Website bucket
* Creates CloudFront distribution _(unless disabled:true)_
* Creates Route 53 RecordSet _(unless disabled:true or hostedZoneId:undefined or endpoint:undefined)_
* Creates S3 Website redirect bucket _(when redirect:true)_
  * And creates corresponding CloudFront distribution and Route 53 RecordSet

> This plugin is designed to work in conjunction with the [_serverless-spa-deploy_](https://github.com/DanteInc/serverless-spa-deploy) plugin.

## serverless.yml

> Optional settings are commented out and show default values

```
plugins:
  - serverless-spa-deploy
  - serverless-spa-config

custom:
  spa:
    files: # per serverless-spa-deploy
      ...
    # redirect: true
  dns:
    hostedZoneId: ZZZZZZZZZZZZZZ
    domainName: example.com
    endpoint: app.${self:custom.cdn.domainName}
  cdn:
    # aliases:
    #   - ${self:custom.cdn.endpoint}
    # priceClass: PriceClass_100
    # acmCertificateArn: arn:aws:acm:region:account-id:certificate/certificate-id
    # logging:
    #   bucketName: ${self:custom.cdn.logging.bucketName}.s3.amazonaws.com
    #   prefix: aws-cloudfront
    # webACLId: arn:aws:waf::account-id:resource-type/resource-id
    # disabled: true
    # enabled: stage1,stage2
```
