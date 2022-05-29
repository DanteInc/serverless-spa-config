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
    aliases:
      - ${self:custom.cdn.endpoint}
    acmCertificateArn: arn:aws:acm:us-east-1:account-id:certificate/certificate-id
    # priceClass: PriceClass_100
    # failover: 
    #   # criteria: [ 500, 502, 503, 504 ]
    #   us-west-2:
    #     bucketDomainName: ${self:service}-${opt:stage}-us-east-1.s3.us-east-1.amazonaws.com
    #     originAccessIdentityId: ${cf(us-east-1):${self:service}-${opt:stage}.WebsiteBucketOriginAccessIdentityId, 'UNDEFINED'}
    #   us-east-1:
    #     bucketDomainName: ${self:service}-${opt:stage}-us-west-2.s3.us-west-2.amazonaws.com
    #     originAccessIdentityId: ${cf(us-west-2):${self:service}-${opt:stage}.WebsiteBucketOriginAccessIdentityId, 'UNDEFINED'}
    # logging:
    #   bucketName: ${self:custom.cdn.logging.bucketName}.s3.amazonaws.com
    #   prefix: aws-cloudfront
    # webACLId: arn:aws:waf::account-id:resource-type/resource-id
    # disabled: true
    # enabled: stage1,stage2
```
