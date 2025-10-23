// ==UserScript==
// @name         HIS系统患者信息增强
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  在查询患者列表时，自动获取并拼接**最近一位**患者的治疗项目、护士、助理和日期信息到备注字段。
// @author       You
// @match        http://his.shmylike.cn/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @require      https://scriptcat.org/lib/637/1.4.8/ajaxHooker.js#sha256=dTF50feumqJW36kBpbf6+LguSLAtLr7CEs3oPmyfbiM=
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/HelloKitty2022/his-enhancer-script/refs/heads/main/his-enhancer-script.user.js
// @downloadURL  https://raw.githubusercontent.com/HelloKitty2022/his-enhancer-script/refs/heads/main/his-enhancer-script.user.js
// ==/UserScript==
 
(function() {
    'use strict';



    console.log('[HIS增强] 脚本已在顶层页面开始加载 (document-start)...');

    // =================================================================
    // 通用工具函数
    // =================================================================

    GM_addStyle(`
        .custom-notification {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #e6f7ff;
            border: 1px solid #91d5ff;
            padding: 15px 20px;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,.1);
            z-index: 9999;
            display: none;
            max-width: 400px;
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        .custom-notification-content {
            font-size: 14px;
            color: #333;
        }
    `);

    function createNotificationElement() {
        const div = document.createElement('div');
        div.className = 'custom-notification';
        div.innerHTML = `<div class="custom-notification-content"></div>`;
        document.body.appendChild(div);
        return div;
    }

    function showNotification(message, duration = 3000) {
        const notificationElement = document.querySelector('.custom-notification') || createNotificationElement();
        const contentElement = notificationElement.querySelector('.custom-notification-content');
        contentElement.innerHTML = message;
        notificationElement.style.display = 'block';
        setTimeout(() => {
            notificationElement.style.display = 'none';
        }, duration);
    }

    // =================================================================
    // 核心功能：请求拦截与数据处理
    // =================================================================

    function gmPost(url, data) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                data: data,
                withCredentials: true,
                onload: function(response) {
                    try {
                        const jsonResponse = JSON.parse(response.responseText);
                        resolve(jsonResponse);
                    } catch (e) {
                        console.error('[HIS增强] 解析JSON失败:', response.responseText);
                        reject(e);
                    }
                },
                onerror: function(error) {
                    console.error('[HIS增强] GM_xmlhttpRequest 请求失败:', error);
                    reject(error);
                }
            });
        });
    }

    async function getExtraInfoForPatient(registId, id) {
        try {
            const treatRecordResponse = await gmPost(
                'http://his.shmylike.cn/his/treat/queryTreatRecord.mvc',
                `registId=${registId}&id=${id}&recordDeptIdfk=85101047&queryType=two`
            );
            const recordUuid = treatRecordResponse?.data?.currentTreat?.[0]?.recorduuid ||treatRecordResponse?.data?.historicalTreat?.[0]?.recorduuid;
            if (!recordUuid) {
                console.log('获取到的recordUuid为空',treatRecordResponse)
                return '';
            }

            const treatInfoResponse = await gmPost(
                'http://his.shmylike.cn/his/treatProc/queryTreatInfo.mvc',
                `treatId=${recordUuid}`
            );
            const treatRecord = treatInfoResponse?.treatRecordList?.[0];
            if (!treatRecord) {
                console.log('获取到的treatRecord为空')
                return '';
            }
            const productName = treatRecord.productsName || '未知项目';
            const nurseName = treatRecord.nurseName || '未知护士';
            const waiterAidName = treatRecord.waiterAidName || '未知助理' ;
            const excuteDate = treatRecord.excuteDate || '未知日期' ;
            const result = `项目: ${productName}🎯 护士: ${nurseName}     助理: ${waiterAidName}     日期: ${excuteDate}\n`;
            return result;

        } catch (error) {
            console.error(`[HIS增强] 获取患者 ${registId} 的额外信息时出错:`, error);
            return '';
        }
    }

    // =================================================================
    // 使用 ajaxHooker 的异步特性设置拦截器
    // =================================================================

    if (typeof ajaxHooker === 'undefined') {
        console.error('[HIS增强] 错误：ajaxHooker 库未能加载。');
        alert('脚本加载失败：ajaxHooker 库未能加载。');
        return;
    }

    console.log('[HIS增强] ajaxHooker 已加载，正在设置异步拦截器...');

    // 关键：使用 async 回调函数
    ajaxHooker.hook(async request => {
        // 检查是否是我们的目标请求
                // 获取请求来源的标识
        const source = window.self === window.top ? '顶层页面' : 'iframe';

        // 打印出关键信息
        console.group(`[调试器] 拦截到新请求`);
        console.log('请求 URL:', request.url);
        console.log('请求来源:', source);
//         console.log('来源 window 对象:', window.self);
//         console.log('顶层 window 对象:', window.top);
        console.groupEnd();

        if (request.url.includes('registManage!queryRegistManageList.action')) {
            console.log('[HIS增强] >>>>> 拦截到目标请求A! <<<<<');
            showNotification('正在获取患者详细信息...', 5000);

            // 关键：取消原始请求，并准备伪造响应
//             request.abort = true;
            request.response = async res => {
                try {
                    // 1. 自己用 GM_xmlhttpRequest 重新发起请求A
                    const originalResponse = await gmPost(request.url, request.data);
                    const patientList = originalResponse.gridResult;

                    if (!Array.isArray(patientList)) {
                        console.warn('[HIS增强] 请求A返回的数据格式不符合预期，未找到 gridResult 数组。');
                        res.responseText = JSON.stringify(originalResponse); // 返回原始数据
                        return;
                    }

                    console.log(`[HIS增强] 开始为 ${patientList.length} 位患者获取额外信息...`);

                    // 2. 遍历患者列表，获取额外信息
//                     for (const patient of patientList) {
//                         const registId = patient.uuid;
//                         const id = patient.customerid;

//                         if (!registId || !id) {
//                             console.warn(`[HIS增强] 患者 ${patient.patientName || '未知'} 缺少必要的 registId 或 id，跳过。`, patient);
//                             continue;
//                         }

//                         const extraInfo = await getExtraInfoForPatient(registId, id);

//                         if (extraInfo) {
//                             const originalRemarks = patient.remarks || '';
//                             patient.remarks = `${originalRemarks}${originalRemarks ? ' | ' : ''}${extraInfo}`;
//                             console.log(`[HIS增强] 已为患者 ${patient.patientName} 更新备注:`, patient.remarks);
//                         }
//                     }

                    // 只处理列表中的第一个患者（通常是最近的一个）
                    if (patientList.length > 0) {
                        const patient = patientList[0];
                        const registId = patient.uuid;
                        const id = patient.customerid;

                        if (!registId || !id) {
                            console.warn(`[HIS增强] 最近一位患者 ${patient.patientName || '未知'} 缺少必要的 registId 或 id，跳过。`, patient);
                        } else {
                            console.log(`[HIS增强] 开始为最近一位患者 (${patient.patientName}) 获取额外信息...`);
                            const extraInfo = await getExtraInfoForPatient(registId, id);
                            console.log('获取到的详细信息',extraInfo);

                            if (extraInfo) {
                                const originalRemarks = patient.remarks || '';
                                patient.remarks = `${originalRemarks}${originalRemarks ? ' | ' : ''}${extraInfo}`;
                                console.log(`[HIS增强] 已为患者 ${patient.patientName} 更新备注:`, patient.remarks);
                            }
                        }
                    } else {
                        console.log('[HIS增强] 患者列表为空，无需处理。');
                    }


                    // 3. 所有数据处理完毕，将修改后的数据赋值给 responseText
                    const modifiedResponse = JSON.stringify(originalResponse);
                    console.log('[HIS增强] 所有患者信息处理完毕，返回修改后的数据。');
                    showNotification('患者信息已更新！', 3000);
                    res.responseText = modifiedResponse;

                } catch (error) {
                    console.error('[HIS增强] 处理响应数据时发生错误:', error);
                    showNotification('处理患者信息时出错，请查看控制台。', 5000);
                    // 出错时，可以返回空或原始数据，这里为了不中断流程，返回空
                    res.responseText = JSON.stringify({ gridResult: [] });
                }
            };
        }
    });

    console.log('[HIS增强] ajaxHooker 异步拦截器设置完成。');

})();

