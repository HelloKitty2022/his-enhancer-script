// ==UserScript==
// @name         HIS系统患者信息增强
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  在查询患者列表时，自动获取并拼接**最近一位**患者的治疗项目、护士、助理和日期信息到备注字段。
// @author       You
// @match        http://his.shmylike.cn/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @require      https://scriptcat.org/lib/637/1.4.8/ajaxHooker.js#sha256=dTF50feumqJW36kBpbf6+LguSLAtLr7CEs3oPmyfbiM=
// @run-at       document-end
// @updateURL    https://cdn.jsdelivr.net/gh/HelloKitty2022/his-enhancer-script@main/his-enhancer-script.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/HelloKitty2022/his-enhancer-script@main/his-enhancer-script.user.js
// ==/UserScript==

(function() {
    'use strict';

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
                        resolve(JSON.parse(response.responseText));
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: function(error) {
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
            const recordUuid = treatRecordResponse?.data?.currentTreat?.[0]?.recorduuid || treatRecordResponse?.data?.historicalTreat?.[0]?.recorduuid;
            if (!recordUuid) return '';

            const treatInfoResponse = await gmPost(
                'http://his.shmylike.cn/his/treatProc/queryTreatInfo.mvc',
                `treatId=${recordUuid}`
            );
            const treatRecord = treatInfoResponse?.treatRecordList?.[0];
            if (!treatRecord) return '';

            const productName = treatRecord.productsName || '未知项目';
            const nurseName = treatRecord.nurseName || '未知护士';
            const waiterAidName = treatRecord.waiterAidName || '未知助理';
            const excuteDate = treatRecord.excuteDate || '未知日期';
            return `项目: ${productName}🎯 护士: ${nurseName} 助理: ${waiterAidName} 日期: ${excuteDate}`;

        } catch (error) {
            return '';
        }
    }

    // =================================================================
    // 使用 ajaxHooker 的异步特性设置拦截器
    // =================================================================

    if (typeof ajaxHooker === 'undefined') {
        alert('脚本加载失败：ajaxHooker 库未能加载。');
        return;
    }

    ajaxHooker.hook(async request => {
        // 确保只在顶层页面处理请求
        if (window.self !== window.top) return;

        if (request.url.includes('registManage!queryRegistManageList.action')) {
            showNotification('正在获取患者详细信息...', 5000);

            // 关键：取消原始请求，并准备伪造响应
            request.abort = true;
            request.response = async res => {
                try {
                    const originalResponse = await gmPost(request.url, request.data);
                    const patientList = originalResponse.gridResult;

                    if (!Array.isArray(patientList)) {
                        res.responseText = JSON.stringify(originalResponse);
                        return;
                    }

                    // 只处理列表中的第一个患者
                    if (patientList.length > 0) {
                        const patient = patientList[0];
                        const registId = patient.uuid;
                        const id = patient.customerid;

                        if (registId && id) {
                            const extraInfo = await getExtraInfoForPatient(registId, id);
                            if (extraInfo) {
                                const originalRemarks = patient.remarks || '';
                                patient.remarks = `${originalRemarks}${originalRemarks ? ' | ' : ''}${extraInfo}`;
                            }
                        }
                    }

                    res.responseText = JSON.stringify(originalResponse);
                    showNotification('患者信息已更新！', 3000);

                } catch (error) {
                    showNotification('处理患者信息时出错，请查看控制台。', 5000);
                    res.responseText = JSON.stringify({ gridResult: [] });
                }
            };
        }
    });

})();
